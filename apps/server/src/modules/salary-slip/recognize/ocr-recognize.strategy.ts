/**
 * 工资条识别 OCR 策略
 * 流程：OcrService → 倾斜检测/几何 deskew → 列对齐 → lineItemsFromOcr → hints
 */
import { Injectable } from "@nestjs/common";
import { OcrService } from "@/plugins/ocr/ocr.service";
import { OcrProviderError } from "@/plugins/ocr/ocr-provider.interface";
import { deskewCells, detectTableSkew, extractAlignedPairs } from "@/plugins/utils/ocr-layout";
import { SalarySlipResultDto } from "../dto/salary-slip-result.dto";
import { lineItemsFromOcr } from "../utils/line-items-from-ocr";
import { buildRecognizeHints, capConfidenceForSkew } from "../utils/recognize-hints";
import { buildOcrLogSnapshot, buildResultLogSnapshot } from "../utils/recognize-logger";
import type { RecognizeStrategyInput, RecognizeStrategyOutcome, SalarySlipRecognizeStrategy } from "./recognize.types";

@Injectable()
export class OcrRecognizeStrategy implements SalarySlipRecognizeStrategy {
  readonly name = "ocr" as const;

  constructor(private readonly ocrService: OcrService) {}

  async recognize(input: RecognizeStrategyInput): Promise<RecognizeStrategyOutcome> {
    const timing: RecognizeStrategyOutcome["timing"] = { ocr: 0, align: 0, rules: 0 };

    let ocrResult;
    const ocrStart = Date.now();
    try {
      ocrResult = await this.ocrService.recognize(input.buffer, input.mimeType);
      timing.ocr = Date.now() - ocrStart;
    } catch (error: unknown) {
      timing.ocr = Date.now() - ocrStart;
      const code = error instanceof Error ? error.message : "ocr_error";
      const providerMeta = error instanceof OcrProviderError ? error.meta : undefined;
      const mapped = mapOcrError(code);
      return {
        ok: false,
        engine: "ocr",
        errorCode: code,
        httpStatus: mapped.httpStatus,
        message: mapped.message,
        timing,
        ocr: buildOcrLogSnapshot({ ok: false, error: code, providerMeta })
      };
    }

    if (!ocrResult.cells.length) {
      return {
        ok: false,
        engine: "ocr",
        errorCode: "ocr_text_too_short",
        httpStatus: 400,
        message: "未识别到有效文字，请重新拍摄",
        timing,
        ocr: buildOcrLogSnapshot({ ok: false, tooShort: true, error: "ocr_text_too_short" })
      };
    }

    const skewResult = detectTableSkew(ocrResult.cells, ocrResult.layout);
    const cellsForAlign = skewResult.skewed ? deskewCells(ocrResult.cells, skewResult) : ocrResult.cells;

    const ocrSnapshot = buildOcrLogSnapshot({
      ok: true,
      provider: ocrResult.provider,
      layout: ocrResult.layout,
      providerMeta: {
        ...ocrResult.meta,
        failReason: skewResult.skewed
          ? `deskew_applied:slope=${skewResult.slope ?? ""}`
          : ocrResult.meta?.failReason
      },
      cells: cellsForAlign,
      text: ocrResult.text
    });

    const alignStart = Date.now();
    const { pairs, orphans } = extractAlignedPairs(cellsForAlign, ocrResult.layout);
    timing.align = Date.now() - alignStart;

    const rulesStart = Date.now();
    const rulesResult = lineItemsFromOcr(pairs, orphans);
    timing.rules = Date.now() - rulesStart;

    const confidence = capConfidenceForSkew(rulesResult.confidence, skewResult.skewed);
    const hints = buildRecognizeHints({ skewed: skewResult.skewed, confidence });
    const resultSnapshot = buildResultLogSnapshot({
      line_items: rulesResult.line_items,
      confidence
    });

    const result: SalarySlipResultDto = {
      line_items: rulesResult.line_items,
      confidence,
      hints
    };

    return {
      ok: true,
      engine: "ocr",
      result,
      timing,
      ocr: ocrSnapshot,
      resultSnapshot
    };
  }
}

function mapOcrError(code: string): { httpStatus: number; message: string } {
  if (code === "ocr_not_configured") {
    return { httpStatus: 503, message: "OCR 服务未配置，请联系管理员" };
  }
  if (code === "ocr_timeout") {
    return { httpStatus: 408, message: "OCR 识别超时，请稍后重试" };
  }
  return { httpStatus: 500, message: "图片识别失败，请稍后重试" };
}
