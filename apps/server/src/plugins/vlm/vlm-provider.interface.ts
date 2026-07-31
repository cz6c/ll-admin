/**
 * VLM 结构化抽取抽象
 * 与 OCR（cells）分离：输出业务向 line_items，不做几何对齐
 */

/** VLM 引擎名；扩展厂商时在此追加 */
export type VlmProviderName = "qwen";

/** 引擎调用参数与诊断信息 */
export interface VlmProviderMeta {
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  failReason?: string;
  responsePreview?: string;
}

/** 单条明细（与工资条 LineItem / DTO 对齐） */
export interface VlmLineItem {
  key: string;
  value: string;
  confidence: number;
  warning: string;
}

export type VlmConfidence = "high" | "medium" | "low";

/** 单引擎 VLM 抽取结果 */
export interface VlmProviderExtractResult {
  line_items: VlmLineItem[];
  confidence: VlmConfidence;
  raw: unknown;
  meta?: VlmProviderMeta;
}

export class VlmProviderError extends Error {
  readonly meta?: VlmProviderMeta;

  constructor(message: string, meta?: VlmProviderMeta) {
    super(message);
    this.name = "VlmProviderError";
    this.meta = meta;
  }
}

/** VLM 引擎抽象，由 VlmService 按配置选择 */
export interface VlmProvider {
  readonly name: VlmProviderName;
  extractSalarySlip(buffer: Buffer, mimeType?: string): Promise<VlmProviderExtractResult>;
}
