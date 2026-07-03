import { Injectable, Logger } from "@nestjs/common";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import { ResultData } from "@/common/utils/result";
import { ImagePreprocessMeta, ImagePreprocessService } from "@/plugins/image-preprocess.service";
import { OcrService } from "@/plugins/ocr.service";
import { OpenAIService } from "@/plugins/openai.service";
import { SALARY_SLIP_FIELD_MAPPING } from "./constants/field-mapping";
import {
  buildJsonRepairUserPrompt,
  buildSalarySlipSystemPrompt,
  buildSalarySlipUserPrompt,
  buildTemplateClassifyUserPrompt,
  SALARY_JSON_REPAIR_PROMPT,
  TEMPLATE_CLASSIFY_SYSTEM_PROMPT
} from "./constants/prompt";
import { DEFAULT_TEMPLATE_ID, getTemplateById, matchTemplateByKeywords, SalarySlipTemplate } from "./constants/templates";
import { SalarySlipResultDto } from "./dto/salary-slip-result.dto";
import { parseAiJson } from "./utils/json-cleaner";
import {
  buildValidateStepSnapshot,
  countNullFields,
  createTraceId,
  logSalarySlipRecognize,
  RecognizeStepsSnapshot,
  SalarySlipRecognizeMetrics,
  TemplateMatchBy,
  truncateForLog
} from "./utils/recognize-logger";
import { validateSalarySlipPayload } from "./utils/salary-slip.validator";

/** OCR 文本低于此长度视为无效识别 */
const OCR_MIN_TEXT_LENGTH = 10;

interface TemplateResolveResult {
  template: SalarySlipTemplate | null;
  matchBy: TemplateMatchBy;
}

/** 工资条识别：预处理 → OCR → 模板匹配 → LLM 结构化 → 校验归一化 */
@Injectable()
export class SalarySlipService {
  private readonly logger = new Logger(SalarySlipService.name);

  constructor(
    private readonly imagePreprocessService: ImagePreprocessService,
    private readonly ocrService: OcrService,
    private readonly openaiService: OpenAIService
  ) {}

  async recognize(file: Express.Multer.File) {
    const traceId = createTraceId();
    const startedAt = Date.now();
    const steps: RecognizeStepsSnapshot = {};
    const metrics: Omit<SalarySlipRecognizeMetrics, "outcome" | "durationMs"> = {
      event: "salary_slip_recognize",
      traceId,
      fileSizeBytes: file.buffer?.length ?? 0,
      steps
    };

    const emit = (outcome: SalarySlipRecognizeMetrics["outcome"], extra?: Partial<SalarySlipRecognizeMetrics>) => {
      logSalarySlipRecognize(this.logger, {
        ...metrics,
        ...extra,
        steps,
        outcome,
        durationMs: Date.now() - startedAt
      });
    };

    if (!file?.buffer?.length) {
      emit("fail", { errorCode: "empty_file", httpStatus: 400 });
      return ResultData.fail(400, "请上传工资条图片");
    }

    const fieldMapping = SALARY_SLIP_FIELD_MAPPING;
    const workDir = await mkdtemp(join(tmpdir(), "salary-slip-"));
    const ext = extname(file.originalname || "") || ".jpg";
    const ocrPath = join(workDir, `upload${ext}`);

    try {
      const preprocessStart = Date.now();
      const { buffer: ocrBuffer, meta: preprocessMeta } = await this.imagePreprocessService.preprocessForOcr(file.buffer, {
        mode: "auto"
      });
      const preprocessMs = Date.now() - preprocessStart;
      metrics.preprocessMs = preprocessMs;
      metrics.preprocessApplied = preprocessMeta.applied;
      metrics.preprocessSkipReason = preprocessMeta.skipReason;
      metrics.preprocessError = preprocessMeta.error;
      metrics.imageWidth = preprocessMeta.inputWidth;
      metrics.imageHeight = preprocessMeta.inputHeight;
      steps.preprocess = this.buildPreprocessStep(preprocessMs, preprocessMeta, ocrBuffer.length);
      await writeFile(ocrPath, ocrBuffer);

      // 1. OCR
      let ocrText: string;
      try {
        const ocrStart = Date.now();
        const ocrResult = await this.ocrService.recognize(ocrPath);
        const ocrMs = Date.now() - ocrStart;
        ocrText = ocrResult.text;
        metrics.ocrMs = ocrMs;
        metrics.ocrTextLength = ocrText.length;
        metrics.ocrLayout = ocrResult.layout;
        metrics.ocrCellCount = ocrResult.cells.length;
        steps.ocr = {
          ms: ocrMs,
          ok: true,
          layout: ocrResult.layout,
          textLength: ocrText.length,
          cellCount: ocrResult.cells.length,
          textPreview: truncateForLog(ocrText)
        };
      } catch (error: unknown) {
        const code = error instanceof Error ? error.message : "ocr_error";
        steps.ocr = { ms: metrics.ocrMs ?? 0, ok: false, error: code };
        metrics.errorCode = code;
        if (code === "ocr_executable_missing") {
          emit("fail", { errorCode: code, httpStatus: 503 });
          return ResultData.fail(503, "OCR 服务未就绪，请联系管理员");
        }
        if (code === "ocr_init_failed" || code.startsWith("ocr_exit_")) {
          emit("fail", { errorCode: code, httpStatus: 503 });
          return ResultData.fail(503, "OCR 引擎启动失败，请确认已部署完整 RapidOCR-json 运行包");
        }
        emit("fail", { errorCode: code, httpStatus: 500 });
        return ResultData.fail(500, "图片识别失败，请稍后重试");
      }

      if (ocrText.trim().length < OCR_MIN_TEXT_LENGTH) {
        steps.ocr = { ...steps.ocr, ok: false, tooShort: true, textLength: ocrText.length };
        emit("fail", { errorCode: "ocr_text_too_short", httpStatus: 400, ocrTextLength: ocrText.length });
        return ResultData.fail(400, "未识别到有效文字，请重新拍摄");
      }

      // 2. 模板匹配（关键词 + LLM 分类）
      const templateStart = Date.now();
      const { template, matchBy } = await this.resolveTemplate(ocrText);
      const templateMs = Date.now() - templateStart;
      const templateId = template?.id ?? DEFAULT_TEMPLATE_ID;
      metrics.templateMs = templateMs;
      metrics.templateId = templateId;
      steps.template = {
        ms: templateMs,
        ok: true,
        templateId,
        matchBy,
        templateName: template?.name ?? "通用"
      };

      // 3. LLM 结构化抽取
      let aiRaw: string;
      try {
        const llmStart = Date.now();
        aiRaw = await this.openaiService.chatCompletions([
          {
            role: "system",
            content: buildSalarySlipSystemPrompt(template ?? undefined),
            cache_control: { type: "ephemeral" }
          },
          { role: "user", content: buildSalarySlipUserPrompt(ocrText) }
        ]);
        const llmMs = Date.now() - llmStart;
        metrics.llmMs = llmMs;
        steps.llm = {
          ms: llmMs,
          ok: true,
          responseLength: aiRaw.length,
          responsePreview: truncateForLog(aiRaw)
        };
      } catch (error: unknown) {
        const code = error instanceof Error ? error.message : "";
        steps.llm = { ms: metrics.llmMs ?? 0, ok: false, error: code || "llm_error" };
        metrics.errorCode = code || "llm_error";
        if (code === "ai_timeout") {
          emit("fail", { errorCode: code, httpStatus: 408 });
          return ResultData.fail(408, "识别超时，请稍后重试");
        }
        if (code === "openai_not_configured") {
          emit("fail", { errorCode: code, httpStatus: 503 });
          return ResultData.fail(503, "AI 服务未配置，请联系管理员");
        }
        emit("fail", { errorCode: metrics.errorCode, httpStatus: 500 });
        return ResultData.fail(500, "薪资解析失败，请稍后重试");
      }

      // 4. JSON 解析（失败时 repair 重试一次）
      let parsed: Record<string, unknown>;
      let jsonRepairUsed = false;
      const parseStart = Date.now();
      try {
        parsed = parseAiJson<Record<string, unknown>>(aiRaw);
      } catch {
        try {
          jsonRepairUsed = true;
          const repaired = await this.openaiService.chatCompletions([
            { role: "system", content: SALARY_JSON_REPAIR_PROMPT },
            { role: "user", content: buildJsonRepairUserPrompt(aiRaw) }
          ]);
          parsed = parseAiJson<Record<string, unknown>>(repaired);
        } catch {
          const parseMs = Date.now() - parseStart;
          metrics.parseMs = parseMs;
          metrics.jsonRepairUsed = jsonRepairUsed;
          steps.parse = { ms: parseMs, ok: false, jsonRepairUsed };
          emit("fail", { errorCode: "json_parse_failed", httpStatus: 500, jsonRepairUsed });
          return ResultData.fail(500, "识别结果解析失败，请重试");
        }
      }
      const parseMs = Date.now() - parseStart;
      metrics.parseMs = parseMs;
      metrics.jsonRepairUsed = jsonRepairUsed;
      const parsedLineItems = (parsed.line_items as Record<string, unknown>) || {};
      steps.parse = {
        ms: parseMs,
        ok: true,
        jsonRepairUsed,
        parsedFieldCount: Object.keys(parsed).length,
        parsedLineItemKeys: Object.keys(parsedLineItems)
      };

      // 5. 校验归一化 + warnings / confidence
      const validated = validateSalarySlipPayload(parsed, fieldMapping);
      steps.validate = buildValidateStepSnapshot(validated);

      const result: SalarySlipResultDto = {
        ...validated.data,
        line_items: validated.line_items,
        template_id: templateId,
        confidence: validated.confidence,
        warnings: validated.warnings.length ? validated.warnings : undefined
      };

      emit("success", {
        confidence: validated.confidence,
        warningsCount: validated.warnings.length,
        nullFieldCount: countNullFields(validated.data),
        lineItemCount: Object.keys(validated.line_items).length,
        jsonRepairUsed
      });

      return ResultData.ok(result);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private buildPreprocessStep(ms: number, meta: ImagePreprocessMeta, outputBytes: number) {
    return {
      ms,
      ok: !meta.error,
      mode: meta.mode,
      applied: meta.applied,
      skipReason: meta.skipReason,
      inputWidth: meta.inputWidth,
      inputHeight: meta.inputHeight,
      outputBytes,
      error: meta.error
    };
  }

  /** Stage-1：关键词匹配；无结果时用轻量 LLM 分类 */
  private async resolveTemplate(ocrText: string): Promise<TemplateResolveResult> {
    const keywordMatch = matchTemplateByKeywords(ocrText);
    if (keywordMatch) {
      return { template: keywordMatch, matchBy: "keyword" };
    }

    try {
      const raw = await this.openaiService.chatCompletions([
        { role: "system", content: TEMPLATE_CLASSIFY_SYSTEM_PROMPT },
        { role: "user", content: buildTemplateClassifyUserPrompt(ocrText) }
      ]);
      const parsed = parseAiJson<{ template_id?: string; reason?: string }>(raw);
      const templateId = parsed.template_id || DEFAULT_TEMPLATE_ID;
      const template = getTemplateById(templateId) ?? null;
      return {
        template,
        matchBy: template ? "llm" : "default"
      };
    } catch {
      return { template: null, matchBy: "default" };
    }
  }
}
