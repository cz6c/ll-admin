import { Logger } from "@nestjs/common";
import { SalarySlipConfidence } from "../dto/salary-slip-result.dto";

export type RecognizeOutcome = "success" | "fail";

export type TemplateMatchBy = "keyword" | "llm" | "default";

/** 单节点处理结果 */
export interface RecognizeStepSnapshot {
  ms: number;
  ok: boolean;
  [key: string]: unknown;
}

export interface RecognizeStepsSnapshot {
  preprocess?: RecognizeStepSnapshot;
  ocr?: RecognizeStepSnapshot;
  template?: RecognizeStepSnapshot;
  llm?: RecognizeStepSnapshot;
  parse?: RecognizeStepSnapshot;
  validate?: RecognizeStepSnapshot;
}

/** 工资条识别结构化指标（不含姓名等敏感字段） */
export interface SalarySlipRecognizeMetrics {
  event: "salary_slip_recognize";
  outcome: RecognizeOutcome;
  traceId: string;
  durationMs: number;
  preprocessMs?: number;
  ocrMs?: number;
  templateMs?: number;
  llmMs?: number;
  parseMs?: number;
  fileSizeBytes?: number;
  preprocessApplied?: boolean;
  preprocessSkipReason?: string;
  preprocessError?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  ocrTextLength?: number;
  ocrLayout?: string;
  ocrCellCount?: number;
  templateId?: string;
  jsonRepairUsed?: boolean;
  confidence?: string;
  warningsCount?: number;
  nullFieldCount?: number;
  lineItemCount?: number;
  errorCode?: string;
  httpStatus?: number;
  /** 各关键节点的处理结果快照 */
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

export function countNullFields(data: {
  name: unknown;
  fixed_salary: unknown;
  welfare_bonus: unknown;
  gross_pay: unknown;
  total_deductions: unknown;
  net_pay: unknown;
  pay_date: unknown;
}): number {
  return [data.name, data.fixed_salary, data.welfare_bonus, data.gross_pay, data.total_deductions, data.net_pay, data.pay_date].filter(
    v => v === null || v === undefined
  ).length;
}

export function buildValidateStepSnapshot(input: {
  confidence: SalarySlipConfidence;
  warnings: string[];
  data: {
    fixed_salary: number | null;
    welfare_bonus: number | null;
    gross_pay: number | null;
    total_deductions: number | null;
    net_pay: number | null;
    pay_date: string | null;
    name: string | null;
  };
  line_items: Record<string, number | null>;
}): RecognizeStepSnapshot {
  const lineItemKeys = Object.keys(input.line_items);
  return {
    ms: 0,
    ok: true,
    confidence: input.confidence,
    warnings: input.warnings,
    nullFieldCount: countNullFields(input.data),
    hasName: input.data.name !== null && input.data.name !== "",
    summary: {
      fixed_salary: input.data.fixed_salary,
      welfare_bonus: input.data.welfare_bonus,
      gross_pay: input.data.gross_pay,
      total_deductions: input.data.total_deductions,
      net_pay: input.data.net_pay,
      pay_date: input.data.pay_date
    },
    lineItemKeys,
    lineItemCount: lineItemKeys.length
  };
}

export function logSalarySlipRecognize(logger: Logger, metrics: SalarySlipRecognizeMetrics): void {
  if (!shouldLogRecognizeMetrics(metrics.outcome)) {
    return;
  }

  logger.log(JSON.stringify(metrics));
}
