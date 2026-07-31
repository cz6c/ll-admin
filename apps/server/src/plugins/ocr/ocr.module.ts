/**
 * OCR 独立模块：仅导出 OcrService（Qwen）
 */
import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { OcrService } from "./ocr.service";
import { QwenOcrProvider } from "./qwen-ocr.provider";

@Module({
  imports: [HttpModule],
  providers: [QwenOcrProvider, OcrService],
  exports: [OcrService]
})
export class OcrModule {}
