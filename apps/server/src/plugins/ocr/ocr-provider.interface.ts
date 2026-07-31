/**
 * OCR 引擎抽象
 * 与 VLM 分离：只产出带坐标 cells，不做业务编排
 */
import type { OcrCell } from "../utils/ocr-layout";

/** OCR 引擎名；当前仅云端 Qwen */
export type OcrProviderName = "qwen";

/** 引擎调用参数与诊断信息（写入 salary_slip_recognize.ocr 日志） */
export interface OcrProviderMeta {
  model?: string;
  task?: string;
  baseUrl?: string;
  timeoutMs?: number;
  enableRotate?: boolean;
  failReason?: string;
  responsePreview?: string;
  remoteCode?: string;
  remoteMessage?: string;
}

/** 降级前一次引擎尝试的快照（跨模态编排日志复用） */
export interface OcrPriorAttempt {
  provider: string;
  reason: string;
  meta?: OcrProviderMeta;
}

/** 单引擎 OCR 原始识别结果（未做布局后处理） */
export interface OcrProviderRecognizeResult {
  cells: OcrCell[];
  raw: unknown;
  meta?: OcrProviderMeta;
}

export class OcrProviderError extends Error {
  readonly meta?: OcrProviderMeta;

  constructor(message: string, meta?: OcrProviderMeta) {
    super(message);
    this.name = "OcrProviderError";
    this.meta = meta;
  }
}

/** OCR 引擎抽象，由 OcrService 门面调用 */
export interface OcrProvider {
  readonly name: OcrProviderName;
  recognize(buffer: Buffer, mimeType?: string): Promise<OcrProviderRecognizeResult>;
}
