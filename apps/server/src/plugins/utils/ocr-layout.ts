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
  columnIndex?: number;
  ambiguous?: boolean;
  /** 0~1，Label 与 Value 的 X 轴对齐置信度 */
  confidence: number;
}

type BoxPoint = [number, number];

interface ColumnBoundary {
  index: number;
  minCx: number;
  maxCx: number;
  centerCx: number;
}

/** 行/列聚类结果，请求生命周期内只计算一次 */
interface LayoutContext {
  rows: OcrCell[][];
  cols: OcrCell[][];
  colThreshold: number;
}

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

function buildLayoutContext(cells: OcrCell[]): LayoutContext {
  return {
    rows: clusterRows(cells),
    cols: clusterCols(cells),
    colThreshold: computeColThreshold(cells)
  };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 根据 Label 与 Value 的 X 轴距离估算对齐置信度 */
function confidenceFromXDistance(dist: number, scale: number): number {
  if (scale <= 0) {
    return 0.5;
  }
  const normalized = Math.min(1, dist / scale);
  return clampConfidence(1 - normalized * 0.85);
}

function rowXScale(row: OcrCell[], fallback: number): number {
  if (row.length < 2) {
    return fallback;
  }
  const xs = row.map(c => c.cx);
  return Math.max(fallback, Math.max(...xs) - Math.min(...xs));
}

function isTitleCell(cell: OcrCell): boolean {
  const text = cell.text.replace(/\s/g, "");
  return /工资条/.test(text) || text.length > 12;
}

function normalizeLeafText(text: string): string {
  let normalized = text.replace(/\s/g, "");

  if (normalized.endsWith("工资工资")) {
    normalized = normalized.slice(0, -2);
  }

  if (normalized === "实发") {
    return "实发工资";
  }

  return normalized;
}

/** 去除 OCR 噪声字符，保留中文/字母/数字及常见标点 */
function cleanLabelText(text: string): string {
  const normalized = normalizeLeafText(text);
  if (!normalized) {
    return "";
  }
  const cleaned = normalized.replace(/[^\u4e00-\u9fa5a-zA-Z0-9()（）\-+]/g, "");
  if (cleaned.length === 1 && !/[\u4e00-\u9fa5]/.test(cleaned)) {
    return "";
  }
  return cleaned;
}

const STAMP_PATTERN = /印章|专用章|财务章|公司章/;
const PAGE_NUMBER_PATTERN = /^(第\s*)?\d+\s*页(\s*\/\s*\d+)?$|^\d+\s*\/\s*\d+$/;
const HEADER_FOOTER_PATTERN = /^(工资条|薪资单|薪酬明细|发放明细|工资明细)$/;
const GARBAGE_SYMBOL_PATTERN = /^[^\u4e00-\u9fa5a-zA-Z0-9]+$/;

function isNoisePair(pair: AlignedPair): boolean {
  const label = pair.label.replace(/\s/g, "");
  const value = (pair.value ?? "").replace(/\s/g, "");

  if (!label && !value) {
    return true;
  }
  if (label && STAMP_PATTERN.test(label)) {
    return true;
  }
  if (label && PAGE_NUMBER_PATTERN.test(label)) {
    return true;
  }
  if (label && HEADER_FOOTER_PATTERN.test(label) && pair.value === null) {
    return true;
  }
  if (label && GARBAGE_SYMBOL_PATTERN.test(label)) {
    return true;
  }
  if (value && GARBAGE_SYMBOL_PATTERN.test(value)) {
    return true;
  }
  return false;
}

/** 过滤印章、页码、页眉页脚及特殊符号乱码 */
export function cleanNoise(pairs: AlignedPair[]): AlignedPair[] {
  return pairs.filter(pair => !isNoisePair(pair));
}

function formatAmountValue(value: string | null): string {
  if (value === null || value.trim() === "" || value.trim() === "-") {
    return "-";
  }
  const normalized = value.replace(/,/g, "").trim();
  if (!/^-?\d+([.,]\d+)?$/.test(normalized.replace(",", "."))) {
    return value;
  }
  const num = Number(normalized.replace(",", "."));
  if (!Number.isFinite(num)) {
    return value;
  }
  return (Math.round(num * 100) / 100).toFixed(2);
}

/** 统一金额格式，空值替换为 -，清洗 label 并稳定排序 */
export function formatForDisplay(pairs: AlignedPair[]): AlignedPair[] {
  return pairs
    .map(pair => {
      const label = cleanLabelText(pair.label);
      return {
        ...pair,
        label: label || (pair.value ? "?" : pair.label),
        value: formatAmountValue(pair.value)
      };
    })
    .sort((a, b) => (a.columnIndex ?? 0) - (b.columnIndex ?? 0));
}

function buildColumnBoundaries(cols: OcrCell[][]): ColumnBoundary[] {
  const centers = cols.map(col => avgCx(col));
  return centers.map((centerCx, index) => {
    const minCx = index === 0 ? -Infinity : (centers[index - 1] + centerCx) / 2;
    const maxCx = index === centers.length - 1 ? Infinity : (centerCx + centers[index + 1]) / 2;
    return { index, minCx, maxCx, centerCx };
  });
}

function columnIndexForCx(cx: number, boundaries: ColumnBoundary[]): number {
  for (const boundary of boundaries) {
    const inRange = boundary.index === boundaries.length - 1 ? cx >= boundary.minCx && cx <= boundary.maxCx : cx >= boundary.minCx && cx < boundary.maxCx;
    if (inRange) {
      return boundary.index;
    }
  }

  let bestIdx = 0;
  let bestDist = Infinity;
  for (const boundary of boundaries) {
    const dist = Math.abs(cx - boundary.centerCx);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = boundary.index;
    }
  }
  return bestIdx;
}

function columnConfidenceForCx(cx: number, boundaries: ColumnBoundary[], boundaryReliable: boolean): number {
  const colIdx = columnIndexForCx(cx, boundaries);
  const boundary = boundaries[colIdx];
  if (!boundary) {
    return boundaryReliable ? 0.4 : 0.2;
  }
  const colWidth = boundary.maxCx - boundary.minCx;
  const scale = Number.isFinite(colWidth) && colWidth > 0 ? colWidth / 2 : 40;
  const dist = Math.abs(cx - boundary.centerCx);
  const base = confidenceFromXDistance(dist, scale);
  return boundaryReliable ? base : clampConfidence(base * 0.55);
}

function isTitleRow(row: OcrCell[]): boolean {
  return row.length === 1 && isTitleCell(row[0]);
}

function findDataRowIndex(rows: OcrCell[][]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row.length) {
      continue;
    }
    const amountCount = row.filter(c => isAmount(c.text)).length;
    if (amountCount / row.length >= 0.5) {
      return i;
    }
  }
  return -1;
}

/** 统计表头行各 Cell 正下方是否为金额，作为叶子表头核心加分项 */
function scoreBelowAmountRatio(headerRow: OcrCell[], belowRow: OcrCell[] | undefined, colThreshold: number): number {
  if (!belowRow?.length) {
    return 0;
  }

  const headerCells = headerRow.filter(c => !isAmount(c.text));
  if (!headerCells.length) {
    return 0;
  }

  let matched = 0;
  for (const cell of headerCells) {
    const hasAmountBelow = belowRow.some(below => Math.abs(below.cx - cell.cx) <= colThreshold && isAmount(below.text));
    if (hasAmountBelow) {
      matched += 1;
    }
  }

  return (matched / headerCells.length) * 18;
}

function findLeafHeaderRowIdx(rows: OcrCell[][], dataRowIdx: number, titleRowIndices: Set<number>, colThreshold: number): number {
  let bestIdx = dataRowIdx - 1;
  let bestScore = -Infinity;

  for (let i = dataRowIdx - 1; i >= 0; i--) {
    if (titleRowIndices.has(i)) {
      continue;
    }

    const texts = rows[i].filter(c => !isAmount(c.text)).map(c => c.text.trim());
    if (!texts.length) {
      continue;
    }

    const unique = new Set(texts);
    const duplicateRatio = 1 - unique.size / texts.length;
    let score = texts.length + unique.size * 3 - duplicateRatio * 15;
    if (i === dataRowIdx - 1) {
      score += 4;
    }

    score += scoreBelowAmountRatio(rows[i], rows[i + 1], colThreshold);

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function buildColumnBoundariesFromLeafRow(leafRow: OcrCell[], colThreshold: number): ColumnBoundary[] {
  const sorted = [...leafRow].sort((a, b) => a.cx - b.cx);
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

  return buildColumnBoundaries(cols);
}

/** 列宽极度不均时，表头行或列边界可能不可靠 */
function isColumnBoundaryReliable(boundaries: ColumnBoundary[]): boolean {
  if (boundaries.length < 2) {
    return true;
  }

  const widths = boundaries.map(b => b.maxCx - b.minCx).filter(w => Number.isFinite(w) && w > 0);
  if (widths.length < 2) {
    return true;
  }

  const min = Math.min(...widths);
  const max = Math.max(...widths);
  if (max > 0 && min / max < 0.3) {
    return false;
  }

  const avg = widths.reduce((sum, w) => sum + w, 0) / widths.length;
  const variance = widths.reduce((sum, w) => sum + (w - avg) ** 2, 0) / widths.length;
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
  return cv <= 0.8;
}

function assignLeafRowToColumns(row: OcrCell[], boundaries: ColumnBoundary[], map: Map<number, string>): void {
  const colCells = new Map<number, OcrCell[]>();

  for (const cell of row) {
    if (isAmount(cell.text)) {
      continue;
    }
    const idx = columnIndexForCx(cell.cx, boundaries);
    const bucket = colCells.get(idx) ?? [];
    bucket.push(cell);
    colCells.set(idx, bucket);
  }

  for (const [idx, cells] of colCells) {
    cells.sort((a, b) => a.cx - b.cx);
    map.set(idx, normalizeLeafText(cells.map(c => c.text).join("")));
  }
}

/** 行聚类路径：叶子表头 + 数据行按列配对（不拼接父级） */
function pairWideTableColumnsByRows(cells: OcrCell[], ctx: LayoutContext): AlignedPair[] {
  const { rows, colThreshold } = ctx;
  if (!rows.length) {
    return [];
  }

  const dataRowIdx = findDataRowIndex(rows);
  if (dataRowIdx < 1) {
    return [];
  }

  const titleRowIndices = new Set<number>();
  for (let i = 0; i < dataRowIdx; i++) {
    if (isTitleRow(rows[i])) {
      titleRowIndices.add(i);
    }
  }

  const leafHeaderRowIdx = findLeafHeaderRowIdx(rows, dataRowIdx, titleRowIndices, colThreshold);
  const leafRow = rows[leafHeaderRowIdx].filter(c => !isAmount(c.text));
  const boundaries = buildColumnBoundariesFromLeafRow(leafRow.length ? leafRow : rows[leafHeaderRowIdx], colThreshold);
  if (!boundaries.length) {
    return [];
  }

  const leafByCol = new Map<number, string>();
  assignLeafRowToColumns(rows[leafHeaderRowIdx], boundaries, leafByCol);

  const boundaryReliable = isColumnBoundaryReliable(boundaries);
  const dataRow = rows[dataRowIdx];
  const pairs: AlignedPair[] = [];

  for (const cell of dataRow) {
    if (!isAmount(cell.text)) {
      continue;
    }
    const colIdx = columnIndexForCx(cell.cx, boundaries);
    const label = leafByCol.get(colIdx) || "?";
    const confidence = columnConfidenceForCx(cell.cx, boundaries, boundaryReliable);

    pairs.push({
      label,
      value: cell.text,
      columnIndex: colIdx,
      ambiguous: boundaryReliable ? undefined : true,
      confidence
    });
  }

  for (const [colIdx, label] of leafByCol) {
    if (label && !pairs.some(p => p.columnIndex === colIdx)) {
      pairs.push({
        label,
        value: null,
        columnIndex: colIdx,
        ambiguous: boundaryReliable ? undefined : true,
        confidence: boundaryReliable ? 0.85 : 0.45
      });
    }
  }

  return pairs;
}

/** 宽表：行聚类 + 全局列边界对齐 */
export function pairWideTableColumns(cells: OcrCell[], ctx?: LayoutContext): AlignedPair[] {
  return pairWideTableColumnsByRows(cells, ctx ?? buildLayoutContext(cells));
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

/** 键值对行内：label 按 X 找最近右侧 amount */
function pairRowByNearestX(row: OcrCell[], colThreshold: number): { pairs: AlignedPair[]; orphans: string[] } {
  const xScale = rowXScale(row, colThreshold * 3);

  if (row.length === 1) {
    const cell = row[0];
    if (isAmount(cell.text)) {
      return { pairs: [], orphans: [cell.text] };
    }
    return { pairs: [{ label: cell.text, value: null, confidence: 0.5 }], orphans: [] };
  }

  const labels = row.filter(c => !isAmount(c.text));
  const amounts = row.filter(c => isAmount(c.text));

  if (!labels.length) {
    return { pairs: [], orphans: amounts.map(c => c.text) };
  }

  if (labels.length === 1 && amounts.length === 1) {
    const dist = Math.abs(amounts[0].cx - labels[0].cx);
    return {
      pairs: [
        {
          label: labels[0].text,
          value: amounts[0].text,
          confidence: confidenceFromXDistance(dist, xScale)
        }
      ],
      orphans: []
    };
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
      const penalty = amt.cx < label.cx - 5 ? 1000 : 0;
      if (dist + penalty < bestDist) {
        bestDist = dist + penalty;
        bestIdx = idx;
      }
    });

    if (bestIdx >= 0) {
      const ambiguous = usedAmountIdx.has(bestIdx);
      usedAmountIdx.add(bestIdx);
      const dist = Math.abs(amounts[bestIdx].cx - label.cx);
      let confidence = confidenceFromXDistance(dist, xScale);
      if (ambiguous) {
        confidence = clampConfidence(confidence * 0.25);
      }
      pairs.push({
        label: label.text,
        value: amounts[bestIdx].text,
        ambiguous: ambiguous || undefined,
        confidence
      });
    } else {
      pairs.push({ label: label.text, value: null, confidence: 0.35 });
    }
  }

  const orphans = amounts.filter((_, idx) => !usedAmountIdx.has(idx)).map(c => c.text);
  return { pairs, orphans };
}

function formatAlignedPairs(pairs: AlignedPair[], header: string, orphans: string[] = []): string {
  const lines: string[] = [header];

  for (const pair of pairs) {
    if (pair.value !== null && pair.label) {
      const suffix = pair.ambiguous || pair.confidence < 0.55 ? " (待核对)" : "";
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
export function detectLayout(cells: OcrCell[], ctx?: LayoutContext): OcrLayoutType {
  const rows = ctx?.rows ?? clusterRows(cells);
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

  return avgCellsPerRow >= 3 ? "wide_table" : "key_value";
}

/** 宽表列对齐：表头 + 数据按 X 配对为「项目: 金额」 */
export function formatOcrAsWideTableKeyValue(cells: OcrCell[]): string {
  const ctx = buildLayoutContext(cells);
  const pairs = cleanNoise(formatForDisplay(pairWideTableColumns(cells, ctx)));
  if (!pairs.length) {
    return formatOcrAsTableText(cells, ctx);
  }
  const labeled = pairs.filter(p => p.label && p.label !== "?");
  const orphans = pairs
    .filter(p => !p.label || p.label === "?")
    .map(p => p.value)
    .filter((v): v is string => v !== null && v !== "-");
  return formatAlignedPairs(labeled, "【宽表列对齐：项目 + 金额】", orphans);
}

/** 将 OCR 单元格按行排列（兜底格式） */
export function formatOcrAsTableText(cells: OcrCell[], ctx?: LayoutContext): string {
  const rows = ctx?.rows ?? clusterRows(cells);
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
  const ctx = buildLayoutContext(cells);
  const allPairs: AlignedPair[] = [];
  const allOrphans: string[] = [];

  for (const row of ctx.rows) {
    const { pairs, orphans } = pairRowByNearestX(row, ctx.colThreshold);
    allPairs.push(...pairs);
    allOrphans.push(...orphans);
  }

  if (!allPairs.length && !allOrphans.length) {
    return "";
  }

  return formatAlignedPairs(cleanNoise(formatForDisplay(allPairs)), "【键值对布局：Y 聚行 + X 对齐】", allOrphans);
}

/** 按布局提取列对齐配对与未配对金额 */
export function extractAlignedPairs(cells: OcrCell[], layout?: OcrLayoutType): { pairs: AlignedPair[]; orphans: string[] } {
  const ctx = buildLayoutContext(cells);
  const resolved = layout ?? detectLayout(cells, ctx);

  let rawPairs: AlignedPair[];
  let orphans: string[];

  if (resolved === "wide_table") {
    rawPairs = pairWideTableColumnsByRows(cells, ctx);
    const labeled = rawPairs.filter(p => p.label && p.label !== "?");
    orphans = rawPairs
      .filter(p => !p.label || p.label === "?")
      .map(p => p.value)
      .filter((v): v is string => v !== null);
    rawPairs = labeled;
  } else {
    rawPairs = [];
    orphans = [];

    for (const row of ctx.rows) {
      const { pairs, orphans: rowOrphans } = pairRowByNearestX(row, ctx.colThreshold);
      rawPairs.push(...pairs);
      orphans.push(...rowOrphans);
    }
  }

  const pairs = formatForDisplay(cleanNoise(rawPairs));
  return { pairs, orphans };
}

/** 按布局格式化为可读文本（日志预览） */
export function formatOcrText(cells: OcrCell[], layout?: OcrLayoutType): string {
  const ctx = buildLayoutContext(cells);
  const resolved = layout ?? detectLayout(cells, ctx);

  if (resolved === "key_value") {
    return formatOcrAsKeyValueText(cells);
  }

  return formatOcrAsWideTableKeyValue(cells);
}

export interface TableSkewResult {
  skewed: boolean;
  slope?: number;
  cyRange?: number;
}

const TABLE_SKEW_SLOPE_THRESHOLD = 0.06;
const TABLE_SKEW_CY_RANGE_FACTOR = 3.5;

/**
 * 检测宽表金额行是否呈斜向分布（拍照倾斜时 cx 增大伴随 cy 单调变化）。
 * 仅对 wide_table 生效。
 */
export function detectTableSkew(cells: OcrCell[], layout?: OcrLayoutType): TableSkewResult {
  const ctx = buildLayoutContext(cells);
  const resolved = layout ?? detectLayout(cells, ctx);
  if (resolved !== "wide_table") {
    return { skewed: false };
  }

  const amounts = cells.filter(c => isAmount(c.text));
  if (amounts.length < 4) {
    return { skewed: false };
  }

  const xs = amounts.map(c => c.cx);
  const ys = amounts.map(c => c.cy);
  const n = amounts.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - meanX) * (ys[i] - meanY);
    varX += (xs[i] - meanX) ** 2;
  }
  const slope = varX > 0 ? cov / varX : 0;

  const cyRange = Math.max(...ys) - Math.min(...ys);
  const rowThreshold = computeRowThreshold(cells);
  const skewed = Math.abs(slope) > TABLE_SKEW_SLOPE_THRESHOLD || cyRange > rowThreshold * TABLE_SKEW_CY_RANGE_FACTOR;

  return {
    skewed,
    slope: Math.round(slope * 1000) / 1000,
    cyRange: Math.round(cyRange)
  };
}
