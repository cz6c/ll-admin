/** OCR 识别单元格，cx/cy 为 bounding box 中心点坐标 */
export interface OcrCell {
  text: string;
  cx: number;
  cy: number;
}

export type OcrLayoutType = "wide_table" | "key_value";

/** 宽表/键值对列对齐结果 */
export interface AlignedPair {
  label: string;
  value: string | null;
  ambiguous?: boolean;
}

type BoxPoint = [number, number];

function isAmount(text: string): boolean {
  return /^-?\d+([.,]\d+)?$/.test(text.replace(/,/g, ""));
}

function getCenter(box: BoxPoint[]): { cx: number; cy: number } {
  const xs = box.map(p => p[0]);
  const ys = box.map(p => p[1]);
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2
  };
}

function median(values: number[]): number {
  if (!values.length) return 20;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avgCx(cells: OcrCell[]): number {
  return cells.reduce((sum, c) => sum + c.cx, 0) / cells.length;
}

function adjacentGaps(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(Math.abs(sorted[i] - sorted[i - 1]));
  }
  return gaps.filter(g => g > 0);
}

function computeRowThreshold(cells: OcrCell[]): number {
  const gaps = adjacentGaps(cells.map(c => c.cy));
  return Math.max(12, median(gaps) * 0.55);
}

function computeColThreshold(cells: OcrCell[]): number {
  const gaps = adjacentGaps(cells.map(c => c.cx));
  return Math.max(12, median(gaps) * 0.55);
}

/** 解析 RapidOCR-json 返回的 box 结构为带坐标的单元格列表 */
export function parseOcrCells(data: unknown): OcrCell[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(item => {
      if (typeof item === "string") {
        return null;
      }
      const record = item as { text?: string; box?: BoxPoint[] };
      if (!record.text?.trim() || !Array.isArray(record.box) || record.box.length < 4) {
        return null;
      }
      const { cx, cy } = getCenter(record.box);
      return { text: record.text.trim(), cx, cy };
    })
    .filter((item): item is OcrCell => Boolean(item));
}

/** 按 Y 坐标聚行，行内按 X 排序 */
export function clusterRows(cells: OcrCell[]): OcrCell[][] {
  if (!cells.length) {
    return [];
  }

  const rowThreshold = computeRowThreshold(cells);
  const sorted = [...cells].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const rows: OcrCell[][] = [];

  for (const cell of sorted) {
    const current = rows[rows.length - 1];
    const rowCy = current ? current.reduce((s, c) => s + c.cy, 0) / current.length : 0;
    if (!current || Math.abs(cell.cy - rowCy) > rowThreshold) {
      rows.push([cell]);
      continue;
    }
    current.push(cell);
  }

  return rows.map(row => row.sort((a, b) => a.cx - b.cx));
}

/** 按 X 坐标聚列，列内按 Y 排序 */
export function clusterCols(cells: OcrCell[]): OcrCell[][] {
  if (!cells.length) {
    return [];
  }

  const colThreshold = computeColThreshold(cells);
  const sorted = [...cells].sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  const cols: OcrCell[][] = [];

  for (const cell of sorted) {
    const current = cols[cols.length - 1];
    const colCx = current ? avgCx(current) : 0;
    if (!current || Math.abs(cell.cx - colCx) > colThreshold) {
      cols.push([cell]);
      continue;
    }
    current.push(cell);
  }

  return cols.map(col => col.sort((a, b) => a.cy - b.cy));
}

/** 在表头行中按 X 找与列最近的非金额文本，多行表头按 Y 拼接 */
function findHeaderLabelAtCx(headerRows: OcrCell[][], colCx: number, colThreshold: number): string {
  const parts: OcrCell[] = [];

  for (const hRow of headerRows) {
    let best: OcrCell | null = null;
    let bestDist = Infinity;
    for (const cell of hRow) {
      if (isAmount(cell.text)) {
        continue;
      }
      const dist = Math.abs(cell.cx - colCx);
      if (dist <= colThreshold && dist < bestDist) {
        bestDist = dist;
        best = cell;
      }
    }
    if (best) {
      parts.push(best);
    }
  }

  parts.sort((a, b) => a.cy - b.cy);
  const texts: string[] = [];
  for (const part of parts) {
    if (!texts.includes(part.text)) {
      texts.push(part.text);
    }
  }
  return texts.join("");
}

/** 宽表：各行金额向上匹配表头同 X 文本；多行表头合并 */
export function pairWideTableColumns(cells: OcrCell[]): AlignedPair[] {
  const rows = clusterRows(cells);
  if (!rows.length) {
    return [];
  }

  const colThreshold = computeColThreshold(cells);
  const pairs: AlignedPair[] = [];
  const seen = new Set<string>();

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const headerRows = rows.slice(0, rowIdx);
    if (!headerRows.length) {
      continue;
    }

    for (const dataCell of row) {
      if (!isAmount(dataCell.text)) {
        continue;
      }

      const label = findHeaderLabelAtCx(headerRows, dataCell.cx, colThreshold);
      const key = `${label}:${dataCell.text}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      pairs.push({ label: label || "?", value: dataCell.text });
    }
  }

  return pairs;
}

/** 键值对行内：label 按 X 找最近右侧 amount */
function pairRowByNearestX(row: OcrCell[]): { pairs: AlignedPair[]; orphans: string[] } {
  if (row.length === 1) {
    const cell = row[0];
    if (isAmount(cell.text)) {
      return { pairs: [], orphans: [cell.text] };
    }
    return { pairs: [{ label: cell.text, value: null }], orphans: [] };
  }

  const labels = row.filter(c => !isAmount(c.text));
  const amounts = row.filter(c => isAmount(c.text));

  if (!labels.length) {
    return { pairs: [], orphans: amounts.map(c => c.text) };
  }

  if (labels.length === 1 && amounts.length === 1) {
    return { pairs: [{ label: labels[0].text, value: amounts[0].text }], orphans: [] };
  }

  const usedAmountIdx = new Set<number>();
  const pairs: AlignedPair[] = [];

  for (const label of labels) {
    let bestIdx = -1;
    let bestDist = Infinity;

    amounts.forEach((amt, idx) => {
      if (usedAmountIdx.has(idx)) {
        return;
      }
      const dist = Math.abs(amt.cx - label.cx);
      // 优先 label 右侧的金额
      const penalty = amt.cx < label.cx - 5 ? 1000 : 0;
      if (dist + penalty < bestDist) {
        bestDist = dist + penalty;
        bestIdx = idx;
      }
    });

    if (bestIdx >= 0) {
      const ambiguous = usedAmountIdx.has(bestIdx);
      usedAmountIdx.add(bestIdx);
      pairs.push({
        label: label.text,
        value: amounts[bestIdx].text,
        ambiguous: ambiguous || undefined
      });
    } else {
      pairs.push({ label: label.text, value: null });
    }
  }

  const orphans = amounts.filter((_, idx) => !usedAmountIdx.has(idx)).map(c => c.text);
  return { pairs, orphans };
}

function formatAlignedPairs(pairs: AlignedPair[], header: string, orphans: string[] = []): string {
  const lines: string[] = [header];

  for (const pair of pairs) {
    if (pair.value !== null && pair.label) {
      const suffix = pair.ambiguous ? " (待核对)" : "";
      lines.push(`${pair.label}: ${pair.value}${suffix}`);
    } else if (pair.label) {
      lines.push(pair.label);
    }
  }

  if (orphans.length) {
    lines.push(`【未配对金额】${orphans.join(", ")}`);
  }

  return lines.join("\n");
}

/** 根据行宽推断 OCR 文本布局：宽表 or 键值对 */
export function detectLayout(cells: OcrCell[]): OcrLayoutType {
  const rows = clusterRows(cells);
  if (!rows.length) {
    return "key_value";
  }

  const avgCellsPerRow = rows.reduce((sum, row) => sum + row.length, 0) / rows.length;
  const wideRows = rows.filter(row => row.length >= 4).length;

  if (avgCellsPerRow >= 4 || wideRows >= Math.max(1, Math.floor(rows.length * 0.3))) {
    return "wide_table";
  }

  if (avgCellsPerRow <= 2.2) {
    return "key_value";
  }

  // 中间地带：列数偏多走宽表，否则键值对
  return avgCellsPerRow >= 3 ? "wide_table" : "key_value";
}

/** 宽表列对齐：表头 + 数据按 X 配对为「项目: 金额」 */
export function formatOcrAsWideTableKeyValue(cells: OcrCell[]): string {
  const pairs = pairWideTableColumns(cells);
  if (!pairs.length) {
    return formatOcrAsTableText(cells);
  }
  const labeled = pairs.filter(p => p.label && p.label !== "?");
  const orphans = pairs.filter(p => !p.label || p.label === "?").map(p => p.value).filter((v): v is string => v !== null);
  return formatAlignedPairs(labeled, "【宽表列对齐：项目 + 金额】", orphans);
}

/** 将 OCR 单元格按行排列（兜底格式） */
export function formatOcrAsTableText(cells: OcrCell[]): string {
  const rows = clusterRows(cells);
  if (!rows.length) {
    return "";
  }

  const lines = rows.map((row, index) => {
    const content = row.map(cell => cell.text).join("\t");
    return `第${index + 1}行: ${content}`;
  });

  return ["【宽表布局：从左到右、从上到下】", ...lines].join("\n");
}

/** 键值对布局：Y 聚行 + X 最近邻配对 */
export function formatOcrAsKeyValueText(cells: OcrCell[]): string {
  const rows = clusterRows(cells);
  if (!rows.length) {
    return "";
  }

  const allPairs: AlignedPair[] = [];
  const allOrphans: string[] = [];

  for (const row of rows) {
    const { pairs, orphans } = pairRowByNearestX(row);
    allPairs.push(...pairs);
    allOrphans.push(...orphans);
  }

  if (!allPairs.length && !allOrphans.length) {
    return "";
  }

  return formatAlignedPairs(allPairs, "【键值对布局：Y 聚行 + X 对齐】", allOrphans);
}

/** 按布局提取列对齐配对与未配对金额 */
export function extractAlignedPairs(
  cells: OcrCell[],
  layout?: OcrLayoutType
): { pairs: AlignedPair[]; orphans: string[] } {
  const resolved = layout ?? detectLayout(cells);

  if (resolved === "wide_table") {
    const pairs = pairWideTableColumns(cells);
    const labeled = pairs.filter(p => p.label && p.label !== "?");
    const orphans = pairs
      .filter(p => !p.label || p.label === "?")
      .map(p => p.value)
      .filter((v): v is string => v !== null);
    return { pairs: labeled, orphans };
  }

  const rows = clusterRows(cells);
  const allPairs: AlignedPair[] = [];
  const allOrphans: string[] = [];

  for (const row of rows) {
    const { pairs, orphans } = pairRowByNearestX(row);
    allPairs.push(...pairs);
    allOrphans.push(...orphans);
  }

  return { pairs: allPairs, orphans: allOrphans };
}

/** 按布局格式化为可读文本（日志预览） */
export function formatOcrText(cells: OcrCell[], layout?: OcrLayoutType): string {
  const resolved = layout ?? detectLayout(cells);

  if (resolved === "key_value") {
    return formatOcrAsKeyValueText(cells);
  }

  return formatOcrAsWideTableKeyValue(cells);
}
