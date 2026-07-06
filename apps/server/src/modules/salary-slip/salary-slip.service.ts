import { Injectable, Logger } from "@nestjs/common";
import { ResultData } from "@/common/utils/result";
import { ImagePreprocessMeta, ImagePreprocessService } from "@/plugins/image-preprocess.service";
import { OcrService } from "@/plugins/ocr.service";
import { extractAlignedPairs } from "@/plugins/utils/ocr-layout";
import { SalarySlipResultDto } from "./dto/salary-slip-result.dto";
import { lineItemsFromOcr } from "./utils/line-items-from-ocr";
import { createTraceId, logSalarySlipRecognize, RecognizeStepsSnapshot, SalarySlipRecognizeMetrics, truncateForLog } from "./utils/recognize-logger";

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  webp: "image/webp"
};

/** 工资条识别：预处理 → OCR → 列对齐 → 规则直出 line_items */
@Injectable()
export class SalarySlipService {
  private readonly logger = new Logger(SalarySlipService.name);

  constructor(
    private readonly imagePreprocessService: ImagePreprocessService,
    private readonly ocrService: OcrService
  ) {}

  async recognize(file: Express.Multer.File) {
    const traceId = createTraceId();
    const startedAt = Date.now();
    const steps: RecognizeStepsSnapshot = {};
    const metrics: Omit<SalarySlipRecognizeMetrics, "outcome" | "durationMs"> = {
      event: "salary_slip_recognize",
      traceId,
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
      emit("fail", { errorCode: "empty_file" });
      return ResultData.fail(400, "请上传工资条图片");
    }

    try {
      const preprocessStart = Date.now();
      const { buffer: ocrBuffer, meta: preprocessMeta } = await this.imagePreprocessService.preprocessForOcr(file.buffer, {
        mode: "auto"
      });
      const preprocessMs = Date.now() - preprocessStart;
      steps.preprocess = this.buildPreprocessStep(preprocessMs, preprocessMeta, file.buffer.length, ocrBuffer.length);

      const mimeType = MIME_BY_FORMAT[preprocessMeta.outputFormat] || "image/jpeg";

      let ocrResult;
      try {
        const ocrStart = Date.now();
        ocrResult = await this.ocrService.recognize(ocrBuffer, mimeType);
        const ocrMs = Date.now() - ocrStart;
        steps.ocr = {
          ms: ocrMs,
          ok: true,
          layout: ocrResult.layout,
          ocrProvider: ocrResult.provider,
          fallbackFrom: ocrResult.fallbackFrom,
          fallbackReason: ocrResult.fallbackReason,
          textLength: ocrResult.text.length,
          cellCount: ocrResult.cells.length,
          textPreview: truncateForLog(ocrResult.text)
        };
      } catch (error: unknown) {
        const code = error instanceof Error ? error.message : "ocr_error";
        steps.ocr = { ms: steps.ocr?.ms ?? 0, ok: false, error: code };
        if (code === "ocr_not_configured") {
          emit("fail", { errorCode: code });
          return ResultData.fail(503, "OCR 服务未配置，请联系管理员");
        }
        if (code === "ocr_executable_missing") {
          emit("fail", { errorCode: code });
          return ResultData.fail(503, "OCR 服务未就绪，请联系管理员");
        }
        if (code === "ocr_init_failed" || code.startsWith("ocr_exit_")) {
          emit("fail", { errorCode: code });
          return ResultData.fail(503, "OCR 引擎启动失败，请确认已部署完整 RapidOCR-json 运行包");
        }
        if (code === "ocr_timeout") {
          emit("fail", { errorCode: code });
          return ResultData.fail(408, "OCR 识别超时，请稍后重试");
        }
        emit("fail", { errorCode: code });
        return ResultData.fail(500, "图片识别失败，请稍后重试");
      }

      if (!ocrResult.cells.length) {
        steps.ocr = { ...steps.ocr, ok: false, tooShort: true, cellCount: 0 };
        emit("fail", { errorCode: "ocr_text_too_short" });
        return ResultData.fail(400, "未识别到有效文字，请重新拍摄");
      }

      const alignStart = Date.now();
      const { pairs, orphans } = extractAlignedPairs(ocrResult.cells, ocrResult.layout);
      const alignMs = Date.now() - alignStart;
      steps.align = {
        ms: alignMs,
        ok: true,
        layout: ocrResult.layout,
        pairCount: pairs.length,
        orphanCount: orphans.length
      };

      const rulesStart = Date.now();
      const rulesResult = lineItemsFromOcr(pairs, orphans);
      const rulesMs = Date.now() - rulesStart;

      const lineItemKeys = Object.keys(rulesResult.line_items);
      steps.rules = {
        ms: rulesMs,
        ok: true,
        confidence: rulesResult.confidence,
        warningCount: rulesResult.warnings.length,
        lineItemCount: lineItemKeys.length,
        lineItemKeys
      };

      const result: SalarySlipResultDto = {
        line_items: rulesResult.line_items,
        warnings: rulesResult.warnings.length ? rulesResult.warnings : undefined,
        confidence: rulesResult.confidence
      };

      emit("success", { lineItemCount: lineItemKeys.length, confidence: rulesResult.confidence });

      return ResultData.ok(result);
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "unknown_error";
      emit("fail", { errorCode: code });
      return ResultData.fail(500, "识别失败，请稍后重试");
    }
  }

  private buildPreprocessStep(ms: number, meta: ImagePreprocessMeta, inputBytes: number, outputBytes: number) {
    return {
      ms,
      ok: !meta.error,
      mode: meta.mode,
      applied: meta.applied,
      skipReason: meta.skipReason,
      inputWidth: meta.inputWidth,
      inputHeight: meta.inputHeight,
      inputBytes,
      outputBytes,
      inputFormat: meta.inputFormat,
      outputFormat: meta.outputFormat,
      error: meta.error
    };
  }
}
