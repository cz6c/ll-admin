/**
 * VLM 独立模块：仅导出 VlmService，不编排 OCR
 */
import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { QwenVlmProvider } from "./qwen-vlm.provider";
import { VlmService } from "./vlm.service";

@Module({
  imports: [HttpModule],
  providers: [QwenVlmProvider, VlmService],
  exports: [VlmService]
})
export class VlmModule {}
