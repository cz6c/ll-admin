import { SalarySlipResultDto, SalarySlipConfidence } from "../dto/salary-slip-result.dto";
import { FieldMapping, DEFAULT_FIELD_MAPPING } from "../constants/field-mapping";

const AMOUNT_FIELDS = ["fixed_salary", "welfare_bonus", "gross_pay", "total_deductions", "net_pay"] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type { SalarySlipConfidence };

export interface SalarySlipValidateResult {
  data: SalarySlipResultDto;
  line_items: Record<string, number | null>;
  warnings: string[];
  confidence: SalarySlipConfidence;
}

function toAmountOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

function toNameOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str || null;
}

function toPayDateOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const str = String(value).trim();

  if (DATE_PATTERN.test(str)) {
    return str;
  }

  const ymMatch = str.match(/^(\d{4})[-/年](\d{1,2})(?:月)?$/);
  if (ymMatch) {
    const month = ymMatch[2].padStart(2, "0");
    return `${ymMatch[1]}-${month}-01`;
  }

  const ymdCn = str.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (ymdCn) {
    return `${ymdCn[1]}-${ymdCn[2].padStart(2, "0")}-${ymdCn[3].padStart(2, "0")}`;
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function sumLineItems(items: Record<string, unknown>, keys: string[]): number | null {
  const values = keys.map(key => pickLineItemByAlias(items, [key]));
  const hasAny = values.some(v => v !== null);
  if (!hasAny) return null;
  const total = values.reduce((sum, v) => sum + (v ?? 0), 0);
  return Math.round(total * 100) / 100;
}

function pickLineItem(items: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const val = toAmountOrNull(items[key]);
    if (val !== null) return val;
  }
  return null;
}

/** 支持 line_items 键名包含 alias（如「基本工资额」匹配「基本工资」） */
function pickLineItemByAlias(items: Record<string, unknown>, aliases: string[]): number | null {
  const direct = pickLineItem(items, aliases);
  if (direct !== null) return direct;

  for (const [key, value] of Object.entries(items)) {
    const normalizedKey = key.replace(/\s+/g, "");
    if (aliases.some(alias => normalizedKey.includes(alias.replace(/\s+/g, "")))) {
      const val = toAmountOrNull(value);
      if (val !== null) return val;
    }
  }
  return null;
}

function normalizeLineItems(raw: Record<string, unknown>): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key] = toAmountOrNull(value);
  }
  return result;
}

/** 根据明细重算汇总，并修正常见误填（如实发/应发/小计混淆） */
export function normalizeSalarySlipPayload(
  raw: Record<string, unknown>,
  mapping: FieldMapping = DEFAULT_FIELD_MAPPING
): SalarySlipResultDto & { line_items: Record<string, number | null> } {
  const lineItemsRaw = (raw.line_items as Record<string, unknown>) || {};
  const line_items = normalizeLineItems(lineItemsRaw);

  let fixed_salary = toAmountOrNull(raw.fixed_salary);
  let welfare_bonus = toAmountOrNull(raw.welfare_bonus);
  let gross_pay = pickLineItemByAlias(lineItemsRaw, mapping.grossAliases) ?? toAmountOrNull(raw.gross_pay);
  let net_pay = pickLineItemByAlias(lineItemsRaw, mapping.netAliases) ?? toAmountOrNull(raw.net_pay);
  const subtotalFromItems = pickLineItemByAlias(lineItemsRaw, mapping.deductionSubtotalAliases);
  const deductionsFromItems = sumLineItems(lineItemsRaw, mapping.deductionKeys);
  let total_deductions = subtotalFromItems ?? deductionsFromItems ?? toAmountOrNull(raw.total_deductions);

  // 误把实发填进 total_deductions（AI 常见错误）
  if (
    total_deductions !== null &&
    net_pay !== null &&
    Math.abs(total_deductions - net_pay) < 0.01 &&
    subtotalFromItems !== null
  ) {
    total_deductions = subtotalFromItems;
  } else if (
    total_deductions !== null &&
    net_pay !== null &&
    Math.abs(total_deductions - net_pay) < 0.01
  ) {
    total_deductions = deductionsFromItems;
  }

  const fixedFromItems = sumLineItems(lineItemsRaw, mapping.fixedSalaryKeys);
  const welfareFromItems = sumLineItems(lineItemsRaw, mapping.welfareKeys);

  if (fixedFromItems !== null) {
    fixed_salary = fixedFromItems;
  } else if (fixed_salary !== null && gross_pay !== null && fixed_salary < gross_pay * 0.5) {
    fixed_salary = null;
  }

  if (welfareFromItems !== null) {
    welfare_bonus = welfareFromItems;
  } else if (welfare_bonus !== null && gross_pay !== null && welfare_bonus >= gross_pay) {
    welfare_bonus = null;
  }

  if (net_pay !== null && gross_pay !== null && net_pay < gross_pay * 0.5) {
    const candidate = pickLineItemByAlias(lineItemsRaw, mapping.netAliases);
    if (candidate !== null && candidate > net_pay) {
      net_pay = candidate;
    }
  }

  if (gross_pay === null && fixed_salary !== null && welfare_bonus !== null) {
    gross_pay = Math.round((fixed_salary + welfare_bonus) * 100) / 100;
  }

  if (total_deductions === null && gross_pay !== null && net_pay !== null) {
    total_deductions = Math.round((gross_pay - net_pay) * 100) / 100;
  }

  return {
    name: toNameOrNull(raw.name),
    fixed_salary,
    welfare_bonus,
    gross_pay,
    total_deductions,
    net_pay,
    pay_date: toPayDateOrNull(raw.pay_date),
    line_items
  };
}

/** 交叉校验汇总字段一致性 */
export function collectConsistencyWarnings(data: SalarySlipResultDto): string[] {
  const warnings: string[] = [];
  const { fixed_salary, welfare_bonus, gross_pay, total_deductions, net_pay } = data;

  if (fixed_salary !== null && welfare_bonus !== null && gross_pay !== null) {
    if (Math.abs(gross_pay - (fixed_salary + welfare_bonus)) > 0.01) {
      warnings.push("应发工资与「固定薪资 + 福利奖金」之和不一致，请核对");
    }
  }

  if (gross_pay !== null && total_deductions !== null && net_pay !== null) {
    if (Math.abs(net_pay - (gross_pay - total_deductions)) > 0.01) {
      warnings.push("实发工资与「应发工资 - 扣款总额」之和不一致，请核对");
    }
  }

  if (gross_pay === null && net_pay === null) {
    warnings.push("未识别到应发或实发金额，请重点核对");
  }

  return warnings;
}

function resolveConfidence(data: SalarySlipResultDto, warnings: string[]): SalarySlipConfidence {
  const coreFilled = data.gross_pay !== null && data.net_pay !== null;
  if (warnings.length === 0 && coreFilled) return "high";
  if (warnings.length <= 1 && (data.gross_pay !== null || data.net_pay !== null)) return "medium";
  return "low";
}

/** 校验 AI 返回字段类型，归一化汇总金额，并输出 warnings / confidence */
export function validateSalarySlipPayload(
  raw: Record<string, unknown>,
  mapping: FieldMapping = DEFAULT_FIELD_MAPPING
): SalarySlipValidateResult {
  const base: Record<string, unknown> = {
    name: toNameOrNull(raw.name),
    pay_date: toPayDateOrNull(raw.pay_date),
    line_items: raw.line_items
  };

  for (const field of AMOUNT_FIELDS) {
    base[field] = toAmountOrNull(raw[field]);
  }

  const normalized = normalizeSalarySlipPayload(base, mapping);
  const { line_items, ...data } = normalized;
  const warnings = collectConsistencyWarnings(data);
  const confidence = resolveConfidence(data, warnings);

  return { data, line_items, warnings, confidence };
}
