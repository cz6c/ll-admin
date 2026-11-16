/**
 * 工资条合计项一致性软校验
 * 应发 − 社保 − 公积金 − 其他扣款 − 专项 − 个税 ≈ 实发；偏差过大则压低整单置信度
 *
 * 取数与 uni salarySlipFieldMap 对齐：
 * 1. 标签 trim 后全等优先，命中则不再用弱正则覆盖
 * 2. 社保/公积金排除公司|单位|企业|基数|补贴|补缴
 * 3. 其他扣款（补缴/缺勤等）累加；合计类字段后写覆盖
 * @note 只改 confidence / 应发·实发行 warning，不改明细 key/value（不影响 uni 回填）
 */
import type { LineItem, LineItemsConfidence } from "./line-items-from-ocr";

interface PickRule {
  exactLabels: string[];
  patterns: RegExp[];
  /** 多行命中时累加（其他扣款）；默认后写覆盖 */
  sum?: boolean;
}

const PRE_TAX: PickRule = {
  exactLabels: ["应发工资", "应发薪金", "税前工资", "税前薪金", "工资总额", "税前合计", "应发总计", "应发合计", "税前月薪"],
  patterns: [
    /应发(?:工资|薪金|合计)?$/,
    /税前(?:工资|薪金|合计)?$/,
    /工资总额$/,
    /税前合计$/,
    /应发总计$/,
    /应发合计/,
    /应发金额/,
    /税前收入/,
    /应发数$/,
    /税前月薪/
  ]
};

const SS: PickRule = {
  exactLabels: ["社保", "五险", "个人社保", "个人五险", "社保合计", "个人社保合计", "五险合计"],
  patterns: [
    /^(?!.*(?:公司|单位|企业|基数|补贴|补缴)).*(?:社保|五险)/,
    /^(?!.*(?:公司|单位|企业|基数|补贴|补缴))个人.*(?:社保|五险)/,
    /^(?!.*(?:公司|单位|企业|基数|补贴|补缴))(?:社保|五险).*个人/,
    /^(?!.*(?:公司|单位|企业|基数|补贴|补缴)).*社保合计/,
    /个人社保合计/
  ]
};

const HF: PickRule = {
  exactLabels: ["公积金", "一金", "个人公积金", "个人一金", "公积金合计", "个人公积金合计"],
  patterns: [
    /^(?!.*(?:公司|单位|企业|基数|补贴|补缴)).*(?:公积金|一金)/,
    /^(?!.*(?:公司|单位|企业|基数|补贴|补缴))个人.*(?:公积金|一金)/,
    /^(?!.*(?:公司|单位|企业|基数|补贴|补缴))(?:公积金|一金).*个人/,
    /^(?!.*(?:公司|单位|企业|基数|补贴|补缴)).*公积金合计/,
    /个人公积金合计/
  ]
};

const OTHER: PickRule = {
  exactLabels: ["社保补缴", "公积金补缴", "补缴", "其他扣款", "缺勤", "事假", "病假", "旷工", "应扣合计"],
  patterns: [
    /^(?!.*(?:公积金|一金|个税|所得税)).*(?:缺勤|事假|病假|旷工|考勤).*/,
    /(?:社保|五险|公积金|一金)?补缴/,
    /其他扣款/,
    /应扣合计$/,
    /缺勤扣款/,
    /事假扣款/,
    /病假扣款/,
    /考勤扣款/,
    /补缴款/
  ],
  sum: true
};

const SPECIAL: PickRule = {
  exactLabels: ["专项附加扣除", "个税专项扣除", "附加扣除", "专项扣除", "专项附加"],
  patterns: [/专项附加扣除/, /个税专项扣除/, /附加扣除/, /专项扣除/, /专项附加$/, /专项附加合计/, /累计专项附加/]
};

const TAX: PickRule = {
  exactLabels: ["个人所得税", "个税", "代扣个税", "所得税", "应交个税"],
  patterns: [/个人所得税/, /个税/, /代扣个税/, /所得税/, /代扣代缴.*税/, /应交个税/, /本月个税/, /扣缴个税/, /税金$/]
};

const POST_TAX: PickRule = {
  exactLabels: ["实发工资", "实发薪金", "税后工资", "税后薪金", "到手工资", "到手薪金", "实发合计", "实发金额", "税后实发", "实际发放"],
  patterns: [
    /实发(?:工资|薪金|合计)?$/,
    /税后(?:工资|薪金)?$/,
    /到手(?:工资|薪金)?$/,
    /实发合计$/,
    /实发金额$/,
    /税后实发$/,
    /实际发放$/,
    /实发数$/,
    /到手金额/,
    /实发月薪/,
    /税后收入/
  ]
};

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

function matchPatterns(label: string, patterns: RegExp[]): boolean {
  const normalized = label.trim();
  if (!normalized) {
    return false;
  }
  return patterns.some(p => p.test(normalized));
}

/**
 * 按规则取金额：全等优先锁定；未命中再走正则；sum 则累加否则后写覆盖
 */
function pickAmount(items: LineItem[], rule: PickRule): number | null {
  let exactFound: number | null = null;
  let hadExact = false;

  for (const item of items) {
    const label = item.key.trim();
    if (!rule.exactLabels.includes(label)) {
      continue;
    }
    const amount = parseAmount(item.value);
    if (amount === null) {
      continue;
    }
    hadExact = true;
    exactFound = rule.sum ? Math.round(((exactFound ?? 0) + amount) * 100) / 100 : amount;
  }
  if (hadExact) {
    return exactFound;
  }

  let weakFound: number | null = null;
  let hadWeak = false;
  for (const item of items) {
    if (!matchPatterns(item.key, rule.patterns)) {
      continue;
    }
    const amount = parseAmount(item.value);
    if (amount === null) {
      continue;
    }
    hadWeak = true;
    weakFound = rule.sum ? Math.round(((weakFound ?? 0) + amount) * 100) / 100 : amount;
  }
  return hadWeak ? weakFound : null;
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
  const other = pickAmount(line_items, OTHER) ?? 0;
  const special = pickAmount(line_items, SPECIAL) ?? 0;
  const tax = pickAmount(line_items, TAX) ?? 0;
  // 与实发自洽口径一致：税前 − 社保 − 公积金 − 其他扣款 − 专项 − 个税
  const expected = Math.round((preTax - ss - hf - other - special - tax) * 100) / 100;
  const tolerance = Math.max(1, Math.abs(preTax) * 0.02);
  const gap = Math.abs(expected - postTax);

  if (gap <= tolerance) {
    return { line_items, confidence };
  }

  const nextConfidence = downgradeConfidence(confidence, "medium");
  const tip = `合计勾稽偏差约 ${gap.toFixed(2)} 元，请核对`;
  const nextItems = line_items.map(item => {
    const label = item.key.trim();
    const isPreTax = PRE_TAX.exactLabels.includes(label) || matchPatterns(item.key, PRE_TAX.patterns);
    const isPostTax = POST_TAX.exactLabels.includes(label) || matchPatterns(item.key, POST_TAX.patterns);
    if (!isPreTax && !isPostTax) {
      return item;
    }
    const warning = item.warning ? `${item.warning}；${tip}` : tip;
    return { ...item, warning };
  });

  return { line_items: nextItems, confidence: nextConfidence };
}
