import type { OcrCell } from "../utils/ocr-layout";

export type OcrProviderName = "qwen" | "local";

/** 单引擎 OCR 原始识别结果（未做布局后处理） */
export interface OcrProviderRecognizeResult {
  cells: OcrCell[];
  raw: unknown;
}

/** OCR 引擎抽象，由 OcrService 门面按配置选择 */
export interface OcrProvider {
  readonly name: OcrProviderName;
  recognize(buffer: Buffer, mimeType?: string): Promise<OcrProviderRecognizeResult>;
}
