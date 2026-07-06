import type { AlignedPair } from "@/plugins/utils/ocr-layout";

export type LineItemsConfidence = "high" | "medium" | "low";

export interface LineItemsFromOcrResult {
  line_items: Record<string, number | null>;
  warnings: string[];
  confidence: LineItemsConfidence;
}

function parseAmount(text: string): number | null {
  const normalized = text.replace(/,/g, "").trim();
  if (!normalized || !/^-?\d+([.,]\d+)?$/.test(normalized.replace(",", "."))) {
    return null;
  }
  const num = Number(normalized.replace(",", "."));
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

function isValidLabel(label: string): boolean {
  return Boolean(label?.trim()) && label !== "?";
}

/** 将对齐配对转为 line_items，并评估置信度 */
export function lineItemsFromOcr(pairs: AlignedPair[], orphans: string[] = []): LineItemsFromOcrResult {
  const line_items: Record<string, number | null> = {};
  const warnings: string[] = [];
  let pairedCount = 0;
  let validPairCount = 0;
  let ambiguousCount = 0;
  let missingLabelCount = 0;

  for (const pair of pairs) {
    if (!isValidLabel(pair.label)) {
      missingLabelCount += 1;
      if (pair.value) {
        warnings.push(`未配对金额：${pair.value}`);
      }
      continue;
    }

    pairedCount += 1;

    if (pair.ambiguous) {
      ambiguousCount += 1;
      warnings.push(`「${pair.label}」金额存在歧义，请核对`);
    }

    if (pair.value === null) {
      line_items[pair.label] = null;
      continue;
    }

    const amount = parseAmount(pair.value);
    if (amount === null) {
      warnings.push(`「${pair.label}」金额格式异常：${pair.value}`);
      line_items[pair.label] = null;
      continue;
    }

    validPairCount += 1;
    if (pair.label in line_items) {
      warnings.push(`重复项目「${pair.label}」，已保留首次识别值`);
      continue;
    }
    line_items[pair.label] = amount;
  }

  for (const orphan of orphans) {
    warnings.push(`未配对金额：${orphan}`);
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

  if (!Object.keys(line_items).length && (orphans.length || missingLabelCount)) {
    confidence = "low";
  }

  return { line_items, warnings, confidence };
}
