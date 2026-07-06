import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OcrProviderName } from "./ocr/ocr-provider.interface";
import { QwenOcrProvider } from "./ocr/qwen-ocr.provider";
import { RapidOcrProvider } from "./ocr/rapid-ocr.provider";
import { detectLayout, formatOcrText, OcrCell, OcrLayoutType } from "./utils/ocr-layout";

/** OCR 识别结果 */
export interface OcrRecognizeResult {
  /** 结构化文本，供日志预览 */
  text: string;
  cells: OcrCell[];
  layout: OcrLayoutType;
  raw: unknown;
  provider: OcrProviderName;
  fallbackFrom?: OcrProviderName;
  fallbackReason?: string;
}

/** OCR 门面：Qwen 优先，失败可降级 RapidOCR */
@Injectable()
export class OcrService {
  constructor(
    private readonly config: ConfigService,
    private readonly qwenOcrProvider: QwenOcrProvider,
    private readonly rapidOcrProvider: RapidOcrProvider
  ) {}

  async recognize(buffer: Buffer, mimeType = "image/jpeg"): Promise<OcrRecognizeResult> {
    const provider = this.resolveProvider();
    const fallbackToLocal = this.config.get<boolean>("ocr.fallbackToLocal") ?? true;

    try {
      return await this.runWithProvider(provider, buffer, mimeType);
    } catch (error: unknown) {
      if (provider === "qwen" && fallbackToLocal) {
        const fallbackReason = error instanceof Error ? error.message : "qwen_error";
        const result = await this.runWithProvider("local", buffer, mimeType);
        return { ...result, fallbackFrom: "qwen", fallbackReason };
      }
      throw error;
    }
  }

  private resolveProvider(): OcrProviderName {
    const configured = this.config.get<string>("ocr.provider");
    return configured === "local" ? "local" : "qwen";
  }

  private async runWithProvider(provider: OcrProviderName, buffer: Buffer, mimeType: string): Promise<OcrRecognizeResult> {
    const engine = provider === "local" ? this.rapidOcrProvider : this.qwenOcrProvider;
    const { cells, raw } = await engine.recognize(buffer, mimeType);
    const layout = detectLayout(cells);
    const text = formatOcrText(cells, layout);

    return { text, cells, layout, raw, provider };
  }
}
