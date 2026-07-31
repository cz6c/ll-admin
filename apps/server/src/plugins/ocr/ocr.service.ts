/**
 * OCR 能力门面（plugins）
 * 职责：调用 Qwen OCR，输出带坐标的 cells + layout
 * 适用：业务侧 OCR 策略；不感知 VLM，跨模态主备由 salary-slip 编排
 */
import { Injectable } from "@nestjs/common";
import { QwenOcrProvider } from "./qwen-ocr.provider";
import type { OcrProviderMeta, OcrProviderName } from "./ocr-provider.interface";
import { detectLayout, formatOcrText, OcrCell, OcrLayoutType } from "../utils/ocr-layout";

/** OCR 识别结果 */
export interface OcrRecognizeResult {
  /** 结构化文本，供日志预览 */
  text: string;
  cells: OcrCell[];
  layout: OcrLayoutType;
  raw: unknown;
  provider: OcrProviderName;
  meta?: OcrProviderMeta;
}

/** OCR 门面：当前仅 Qwen OCR */
@Injectable()
export class OcrService {
  constructor(private readonly qwenOcrProvider: QwenOcrProvider) {}

  /** 识别图片为带坐标单元格 */
  async recognize(buffer: Buffer, mimeType = "image/jpeg"): Promise<OcrRecognizeResult> {
    const { cells, raw, meta } = await this.qwenOcrProvider.recognize(buffer, mimeType);
    const layout = detectLayout(cells);
    const text = formatOcrText(cells, layout);

    return { text, cells, layout, raw, provider: "qwen", meta };
  }
}
