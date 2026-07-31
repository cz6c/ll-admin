/**
 * VLM 能力门面（plugins）
 * 职责：调用 Qwen VLM 抽取工资条结构化明细
 * 适用：业务侧 VLM 策略；配置见 aliyun.vlm.*；跨模态主备由 salary-slip 编排
 */
import { Injectable } from "@nestjs/common";
import { QwenVlmProvider } from "./qwen-vlm.provider";
import type { VlmProviderExtractResult, VlmProviderName } from "./vlm-provider.interface";

/** VLM 抽取结果（门面层，可扩展 fallback 字段） */
export interface VlmExtractResult extends VlmProviderExtractResult {
  provider: VlmProviderName;
}

@Injectable()
export class VlmService {
  constructor(private readonly qwenVlmProvider: QwenVlmProvider) {}

  /** 结构化抽取工资条；当前仅 DashScope / Qwen VL */
  async extractSalarySlip(buffer: Buffer, mimeType = "image/jpeg"): Promise<VlmExtractResult> {
    const result = await this.qwenVlmProvider.extractSalarySlip(buffer, mimeType);
    return { ...result, provider: "qwen" };
  }
}
