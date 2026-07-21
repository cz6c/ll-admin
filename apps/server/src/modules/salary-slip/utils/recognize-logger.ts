/**
 * 工资条识别结构化日志工具
 * 生产环境成功请求按 SUCCESS_SAMPLE_RATE 采样；失败始终记录
 */
import type { Logger } from "@nestjs/common";
import type { OcrPriorAttempt, OcrProviderMeta } from "@/plugins/ocr/ocr-provider.interface";
import type { OcrCell } from "@/plugins/utils/ocr-layout";
import type { LineItem, LineItemsFromOcrResult } from "./line-items-from-ocr";

export type RecognizeOutcome = "success" | "fail";

/** OCR 单元格日志项（含坐标，便于排查对齐问题） */
export interface OcrCellLogEntry {
  text: string;
  cx: number;
  cy: number;
}

/** OCR 识别快照（日志专用） */
export interface OcrLogSnapshot {
  ok: boolean;
  provider?: string;
  layout?: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  /** 引擎调用参数（model / task / baseUrl 等） */
  providerMeta?: OcrProviderMeta;
  /** 降级前失败的引擎尝试（如 qwen → local） */
  priorAttempt?: OcrPriorAttempt;
  cellCount?: number;
  /** 全量识别单元格（含坐标，不截断） */
  cells?: OcrCellLogEntry[];
  error?: string;
  tooShort?: boolean;
}

/** 接口返回快照（日志专用） */
export interface ResultLogSnapshot {
  confidence?: string;
  lineItemCount: number;
  line_items: LineItem[];
}

/** 各阶段耗时（毫秒） */
export interface RecognizeTiming {
  preprocess: number;
  ocr: number;
  align: number;
  rules: number;
}

/**
 * 工资条识别结构化日志。
 * 顶层聚焦 ocr（识别输入）与 result（最终输出），timing 记录各阶段耗时。
 */
export interface SalarySlipRecognizeMetrics {
  event: "salary_slip_recognize";
  traceId: string;
  outcome: RecognizeOutcome;
  durationMs: number;
  errorCode?: string;
  timing?: RecognizeTiming;
  ocr?: OcrLogSnapshot;
  result?: ResultLogSnapshot;
}

/** 生产环境成功请求采样率（失败始终记录） */
const SUCCESS_SAMPLE_RATE = 0.1;

/** 生成短 traceId，串联单次识别全链路日志 */
export function createTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

function toCellLogEntries(cells: OcrCell[]): OcrCellLogEntry[] {
  return cells.map(cell => ({
    text: cell.text,
    cx: roundCoord(cell.cx),
    cy: roundCoord(cell.cy)
  }));
}

function roundConfidence(items: LineItem[]): LineItem[] {
  return items.map(item => ({
    ...item,
    confidence: Math.round(item.confidence * 1000) / 1000
  }));
}

/** 组装 OCR 阶段日志快照（含单元格坐标，便于排查对齐） */
export function buildOcrLogSnapshot(input: {
  ok: boolean;
  provider?: string;
  layout?: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  providerMeta?: OcrProviderMeta;
  priorAttempt?: OcrPriorAttempt;
  cells?: OcrCell[];
  text?: string;
  error?: string;
  tooShort?: boolean;
}): OcrLogSnapshot {
  const snapshot: OcrLogSnapshot = { ok: input.ok };

  if (input.provider) snapshot.provider = input.provider;
  if (input.layout) snapshot.layout = input.layout;
  if (input.fallbackFrom) snapshot.fallbackFrom = input.fallbackFrom;
  if (input.fallbackReason) snapshot.fallbackReason = input.fallbackReason;
  if (input.providerMeta) snapshot.providerMeta = input.providerMeta;
  if (input.priorAttempt) snapshot.priorAttempt = input.priorAttempt;
  if (input.error) snapshot.error = input.error;
  if (input.tooShort) snapshot.tooShort = input.tooShort;

  if (input.cells?.length) {
    snapshot.cellCount = input.cells.length;
    snapshot.cells = toCellLogEntries(input.cells);
  }

  return snapshot;
}

/** 组装最终 line_items 结果快照（置信度截断到千分位） */
export function buildResultLogSnapshot(rulesResult: LineItemsFromOcrResult): ResultLogSnapshot {
  return {
    confidence: rulesResult.confidence,
    lineItemCount: rulesResult.line_items.length,
    line_items: roundConfidence(rulesResult.line_items)
  };
}

/**
 * 是否落盘本次识别日志
 * 非生产全记；生产失败必记、成功按 SUCCESS_SAMPLE_RATE 采样
 */
export function shouldLogRecognizeMetrics(outcome: RecognizeOutcome): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  if (outcome === "fail") {
    return true;
  }
  return Math.random() < SUCCESS_SAMPLE_RATE;
}

/** 按采样策略输出结构化 JSON 日志 */
export function logSalarySlipRecognize(logger: Logger, metrics: SalarySlipRecognizeMetrics): void {
  if (!shouldLogRecognizeMetrics(metrics.outcome)) {
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const payload = isProd ? JSON.stringify(metrics) : JSON.stringify(metrics, null, 2);
  logger.log(payload);
}
