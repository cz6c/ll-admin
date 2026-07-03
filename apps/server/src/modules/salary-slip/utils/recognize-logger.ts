import type { Logger } from "@nestjs/common";

export type RecognizeOutcome = "success" | "fail";

export type TemplateMatchBy = "keyword" | "llm" | "default";

/** 单阶段处理快照 */
export interface RecognizeStepSnapshot {
  /** 该阶段耗时（毫秒） */
  ms: number;
  /** 该阶段是否成功完成 */
  ok: boolean;
  [key: string]: unknown;
}

/** 各阶段调试快照，失败时可定位卡在哪个环节 */
export interface RecognizeStepsSnapshot {
  /** 图像预处理：是否增强、跳过原因、尺寸 */
  preprocess?: RecognizeStepSnapshot;
  /** OCR：版式、字数、文本预览 */
  ocr?: RecognizeStepSnapshot;
  /** 模板匹配：命中方式与模板 ID */
  template?: RecognizeStepSnapshot;
  /** LLM 抽取：响应长度与预览 */
  llm?: RecognizeStepSnapshot;
  /** JSON 解析：repair 是否触发、line_items 键名 */
  parse?: RecognizeStepSnapshot;
}

/**
 * 工资条识别结构化日志。
 * 顶层仅保留检索/概览字段，阶段细节见 steps（不含 OCR 全文与 line_items 金额）。
 */
export interface SalarySlipRecognizeMetrics {
  /** 固定事件名，便于日志平台过滤 */
  event: "salary_slip_recognize";
  /** 请求最终成败 */
  outcome: RecognizeOutcome;
  /** 单次识别唯一 ID，用于串联同一次请求的多条日志 */
  traceId: string;
  /** 端到端总耗时（毫秒） */
  durationMs: number;
  /** 失败时的内部错误码，如 ocr_text_too_short、ai_timeout、json_parse_failed */
  errorCode?: string;
  /** 成功时解析出的 line_items 条目数，用于评估识别完整度 */
  lineItemCount?: number;
  /** 各阶段明细：耗时、关键参数、文本预览、错误原因 */
  steps?: RecognizeStepsSnapshot;
}

/** 生产环境成功请求采样率（失败始终记录） */
const SUCCESS_SAMPLE_RATE = 0.1;

const TEXT_PREVIEW_MAX = 280;

export function createTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function truncateForLog(text: string, maxLen = TEXT_PREVIEW_MAX): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, maxLen)}…`;
}

export function shouldLogRecognizeMetrics(outcome: RecognizeOutcome): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  if (outcome === "fail") {
    return true;
  }
  return Math.random() < SUCCESS_SAMPLE_RATE;
}

export function logSalarySlipRecognize(logger: Logger, metrics: SalarySlipRecognizeMetrics): void {
  if (!shouldLogRecognizeMetrics(metrics.outcome)) {
    return;
  }

  logger.log(JSON.stringify(metrics));
}
