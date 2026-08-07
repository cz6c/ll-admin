/**
 * 工资条识别 VLM 策略
 * 流程：VlmService 结构化抽取 → 规范化为 SalarySlipResultDto
 */
import { Injectable } from "@nestjs/common";
import { VlmService } from "@/plugins/vlm/vlm.service";
import { VlmProviderError } from "@/plugins/vlm/vlm-provider.interface";
import { SalarySlipResultDto } from "../dto/salary-slip-result.dto";
import { buildRecognizeHints } from "../utils/recognize-hints";
import { buildOcrLogSnapshot, buildResultLogSnapshot } from "../utils/recognize-logger";
import type { RecognizeStrategyInput, RecognizeStrategyOutcome, SalarySlipRecognizeStrategy } from "./recognize.types";

@Injectable()
export class VlmRecognizeStrategy implements SalarySlipRecognizeStrategy {
  readonly name = "vlm" as const;

  constructor(private readonly vlmService: VlmService) {}

  async recognize(input: RecognizeStrategyInput): Promise<RecognizeStrategyOutcome> {
    const timing: RecognizeStrategyOutcome["timing"] = { vlm: 0 };
    const vlmStart = Date.now();

    try {
      const extracted = await this.vlmService.extractSalarySlip(input.buffer, input.mimeType);
      timing.vlm = Date.now() - vlmStart;

      const hints = buildRecognizeHints({ confidence: extracted.confidence });
      const result: SalarySlipResultDto = {
        line_items: extracted.line_items,
        confidence: extracted.confidence,
        hints
      };
      const resultSnapshot = buildResultLogSnapshot({
        line_items: extracted.line_items,
        confidence: extracted.confidence
      });

      // 复用 ocr 日志槽位记录引擎诊断，便于现有日志查询
      const ocr = buildOcrLogSnapshot({
        ok: true,
        provider: `vlm:${extracted.provider}`,
        providerMeta: extracted.meta
          ? {
              model: extracted.meta.model,
              baseUrl: extracted.meta.baseUrl,
              timeoutMs: extracted.meta.timeoutMs,
              failReason: extracted.meta.failReason,
              responsePreview: extracted.meta.responsePreview
            }
          : undefined
      });

      if (!extracted.line_items.length) {
        return {
          ok: false,
          engine: "vlm",
          errorCode: "vlm_empty",
          httpStatus: 400,
          message: "未识别到金额明细，请重新拍摄",
          timing,
          ocr: buildOcrLogSnapshot({ ok: false, error: "vlm_empty", providerMeta: extracted.meta }),
          result,
          resultSnapshot
        };
      }

      return {
        ok: true,
        engine: "vlm",
        result,
        timing,
        ocr,
        resultSnapshot
      };
    } catch (error: unknown) {
      timing.vlm = Date.now() - vlmStart;
      const code = error instanceof Error ? error.message : "vlm_error";
      const providerMeta = error instanceof VlmProviderError ? error.meta : undefined;
      const mapped = mapVlmError(code);
      return {
        ok: false,
        engine: "vlm",
        errorCode: code,
        httpStatus: mapped.httpStatus,
        message: mapped.message,
        timing,
        ocr: buildOcrLogSnapshot({
          ok: false,
          error: code,
          provider: "vlm",
          providerMeta: providerMeta
            ? {
                model: providerMeta.model,
                baseUrl: providerMeta.baseUrl,
                timeoutMs: providerMeta.timeoutMs,
                failReason: providerMeta.failReason,
                responsePreview: providerMeta.responsePreview
              }
            : undefined
        })
      };
    }
  }
}

function mapVlmError(code: string): { httpStatus: number; message: string } {
  if (code === "vlm_not_configured") {
    return { httpStatus: 503, message: "VLM 服务未配置，请联系管理员" };
  }
  if (code === "vlm_timeout") {
    return { httpStatus: 408, message: "VLM 识别超时，请稍后重试" };
  }
  if (code === "vlm_empty" || code === "vlm_parse_error") {
    return { httpStatus: 400, message: "未识别到金额明细，请重新拍摄" };
  }
  return { httpStatus: 500, message: "图片识别失败，请稍后重试" };
}
