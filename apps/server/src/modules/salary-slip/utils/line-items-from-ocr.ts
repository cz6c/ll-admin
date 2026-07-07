import type { AlignedPair } from "@/plugins/utils/ocr-layout";

export type LineItemsConfidence = "high" | "medium" | "low";

export interface LineItem {
  key: string;
  value: string;
  confidence: number;
  warning: string;
}

export interface LineItemsFromOcrResult {
  line_items: LineItem[];
  confidence: LineItemsConfidence;
}

function parseAmount(text: string): number | null {
  const normalized = text.replace(/,/g, "").trim();
  if (!normalized || normalized === "-") {
    return null;
  }
  if (!/^-?\d+([.,]\d+)?$/.test(normalized.replace(",", "."))) {
    return null;
  }
  const num = Number(normalized.replace(",", "."));
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

function formatAmountDisplay(text: string): string {
  const amount = parseAmount(text);
  if (amount === null) {
    return text.trim() || "-";
  }
  return (Math.round(amount * 100) / 100).toFixed(2);
}

function isValidLabel(label: string): boolean {
  return Boolean(label?.trim()) && label !== "?";
}

function resolveLineItemKey(label: string, existingKeys: Set<string>): string {
  if (!existingKeys.has(label)) {
    return label;
  }
  let index = 2;
  while (existingKeys.has(`${label}(${index})`)) {
    index += 1;
  }
  return `${label}(${index})`;
}

function buildPairWarning(pair: AlignedPair): string {
  if (pair.ambiguous) {
    return `「${pair.label}」金额存在歧义，请核对`;
  }
  if (pair.confidence < 0.55) {
    return `「${pair.label}」对齐置信度较低（${Math.round(pair.confidence * 100)}%），请核对`;
  }
  return "";
}

function appendWarning(current: string, extra: string): string {
  if (!extra) {
    return current;
  }
  return current ? `${current}；${extra}` : extra;
}

/** 将对齐配对转为 line_items，并评估置信度 */
export function lineItemsFromOcr(pairs: AlignedPair[], orphans: string[] = []): LineItemsFromOcrResult {
  const line_items: LineItem[] = [];
  const existingKeys = new Set<string>();
  let pairedCount = 0;
  let validPairCount = 0;
  let ambiguousCount = 0;
  let missingLabelCount = 0;

  for (const pair of pairs) {
    if (!isValidLabel(pair.label)) {
      missingLabelCount += 1;
      if (pair.value && pair.value !== "-") {
        line_items.push({
          key: "",
          value: formatAmountDisplay(pair.value),
          confidence: pair.confidence,
          warning: `未配对金额：${pair.value}`
        });
      }
      continue;
    }

    pairedCount += 1;
    let warning = buildPairWarning(pair);

    if (pair.ambiguous) {
      ambiguousCount += 1;
    } else if (pair.confidence < 0.55) {
      ambiguousCount += 1;
    }

    let value = "-";
    if (pair.value !== null && pair.value !== "-") {
      const amount = parseAmount(pair.value);
      if (amount === null) {
        warning = appendWarning(warning, `「${pair.label}」金额格式异常：${pair.value}`);
        value = pair.value;
      } else {
        validPairCount += 1;
        value = formatAmountDisplay(pair.value);
      }
    }

    let key = pair.label;
    if (existingKeys.has(key)) {
      key = resolveLineItemKey(pair.label, existingKeys);
      warning = appendWarning(warning, `重复项目「${pair.label}」，已记为「${key}」`);
    }
    existingKeys.add(key);

    line_items.push({
      key,
      value,
      confidence: pair.confidence,
      warning
    });
  }

  for (const orphan of orphans) {
    line_items.push({
      key: "",
      value: formatAmountDisplay(orphan),
      confidence: 0,
      warning: `未配对金额：${orphan}`
    });
  }

  const totalCandidates = pairedCount + orphans.length + missingLabelCount;
  const pairRate = totalCandidates > 0 ? validPairCount / totalCandidates : 0;

  let confidence: LineItemsConfidence;
  if (pairRate >= 0.9 && ambiguousCount === 0 && orphans.length === 0 && missingLabelCount === 0) {
    confidence = "high";
  } else if (pairRate >= 0.6 && ambiguousCount <= 2) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  if (!line_items.length && (orphans.length || missingLabelCount)) {
    confidence = "low";
  }

  return { line_items, confidence };
}
