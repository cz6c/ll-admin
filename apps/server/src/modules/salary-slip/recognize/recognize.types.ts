/**
 * 工资条识别策略统一契约
 * 业务编排只认此结果形状，不感知厂商 SDK
 */
import type { SalarySlipResultDto } from "../dto/salary-slip-result.dto";
import type { OcrLogSnapshot, RecognizeTiming, ResultLogSnapshot } from "../utils/recognize-logger";

/** 识别引擎（跨模态）；OCR 内部 qwen/local 不暴露到此层 */
export type RecognizeEngine = "vlm" | "ocr";

export interface RecognizeStrategySuccess {
  ok: true;
  engine: RecognizeEngine;
  result: SalarySlipResultDto;
  timing: Partial<RecognizeTiming>;
  ocr?: OcrLogSnapshot;
  resultSnapshot: ResultLogSnapshot;
}

export interface RecognizeStrategyFailure {
  ok: false;
  engine: RecognizeEngine;
  errorCode: string;
  httpStatus: number;
  message: string;
  timing: Partial<RecognizeTiming>;
  ocr?: OcrLogSnapshot;
  /** 软失败（如 low confidence）时仍可能带出部分结果，供编排决定是否 fallback */
  result?: SalarySlipResultDto;
  resultSnapshot?: ResultLogSnapshot;
}

export type RecognizeStrategyOutcome = RecognizeStrategySuccess | RecognizeStrategyFailure;

export interface RecognizeStrategyInput {
  buffer: Buffer;
  mimeType: string;
}

/** 单模态识别策略 */
export interface SalarySlipRecognizeStrategy {
  readonly name: RecognizeEngine;
  recognize(input: RecognizeStrategyInput): Promise<RecognizeStrategyOutcome>;
}
