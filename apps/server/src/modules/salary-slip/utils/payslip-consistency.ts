/**
 * 工资条合计项一致性软校验
 * 应发 − 社保 − 公积金 − 专项 − 个税 ≈ 实发；偏差过大则压低整单置信度
 */
import type { LineItem, LineItemsConfidence } from "./line-items-from-ocr";

const PRE_TAX = [/应发(?:工资|薪金|合计)?$/, /税前(?:工资|薪金|合计)?$/, /工资总额$/, /税前合计$/, /应发总计$/];
const SS = [/^(?!.*(?:公司|单位|企业|基数|补贴)).*(?:社保|五险)/, /个人.*(?:社保|五险)/, /(?:社保|五险).*个人/];
const HF = [/^(?!.*(?:公司|单位|企业|基数|补贴)).*(?:公积金|一金)/, /个人.*(?:公积金|一金)/, /(?:公积金|一金).*个人/];
const SPECIAL = [/专项附加扣除/, /个税专项扣除/, /附加扣除/, /专项扣除/, /专项附加$/];
const TAX = [/个人所得税/, /个税/, /代扣个税/, /所得税/, /代扣代缴.*税/, /应交个税/];
const POST_TAX = [/实发(?:工资|薪金|合计)?$/, /税后(?:工资|薪金)?$/, /到手(?:工资|薪金)?$/, /实发合计$/, /实发金额$/, /税后实发$/, /实际发放$/];

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return null;
  }
  const num = Number(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

function matchAny(label: string, patterns: RegExp[]): boolean {
  const normalized = label.trim();
  if (!normalized) {
    return false;
  }
  return patterns.some(p => p.test(normalized));
}

function pickAmount(items: LineItem[], patterns: RegExp[]): number | null {
  let found: number | null = null;
  for (const item of items) {
    if (!matchAny(item.key, patterns)) {
      continue;
    }
    const amount = parseAmount(item.value);
    if (amount !== null) {
      found = amount;
    }
  }
  return found;
}

function downgradeConfidence(current: LineItemsConfidence, max: LineItemsConfidence): LineItemsConfidence {
  const rank = { high: 3, medium: 2, low: 1 };
  return rank[current] <= rank[max] ? current : max;
}

/**
 * 合计勾稽失败时压低 confidence，并给实发/应发行追加 warning
 */
export function applyPayslipConsistencyCheck(
  line_items: LineItem[],
  confidence: LineItemsConfidence
): { line_items: LineItem[]; confidence: LineItemsConfidence } {
  const preTax = pickAmount(line_items, PRE_TAX);
  const postTax = pickAmount(line_items, POST_TAX);
  if (preTax === null || postTax === null) {
    return { line_items, confidence };
  }

  const ss = pickAmount(line_items, SS) ?? 0;
  const hf = pickAmount(line_items, HF) ?? 0;
  const special = pickAmount(line_items, SPECIAL) ?? 0;
  const tax = pickAmount(line_items, TAX) ?? 0;
  const expected = Math.round((preTax - ss - hf - special - tax) * 100) / 100;
  const tolerance = Math.max(1, Math.abs(preTax) * 0.02);
  const gap = Math.abs(expected - postTax);

  if (gap <= tolerance) {
    return { line_items, confidence };
  }

  const nextConfidence = downgradeConfidence(confidence, "medium");
  const tip = `合计勾稽偏差约 ${gap.toFixed(2)} 元，请核对`;
  const nextItems = line_items.map(item => {
    if (!matchAny(item.key, PRE_TAX) && !matchAny(item.key, POST_TAX)) {
      return item;
    }
    const warning = item.warning ? `${item.warning}；${tip}` : tip;
    return { ...item, warning };
  });

  return { line_items: nextItems, confidence: nextConfidence };
}
