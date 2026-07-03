/** OCR 识别单元格，cx/cy 为 bounding box 中心点坐标 */
export interface OcrCell {
  text: string;
  cx: number;
  cy: number;
}

export type OcrLayoutType = "wide_table" | "key_value" | "mixed";

type BoxPoint = [number, number];

const SECTION_KEYWORDS = ["应发", "实发", "扣款", "收入", "代扣", "合计", "小计"];

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

export function clusterRows(cells: OcrCell[]): OcrCell[][] {
  if (!cells.length) {
    return [];
  }

  const heights = cells.map(cell => cell.cy);
  const rowThreshold = Math.max(12, median(heights.map((_, i, arr) => Math.abs(arr[i] - arr[i - 1] || 0))) * 0.55);

  const sorted = [...cells].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const rows: OcrCell[][] = [];

  for (const cell of sorted) {
    const current = rows[rows.length - 1];
    if (!current || Math.abs(cell.cy - current[0].cy) > rowThreshold) {
      rows.push([cell]);
      continue;
    }
    current.push(cell);
  }

  return rows.map(row => row.sort((a, b) => a.cx - b.cx));
}

/** 根据行宽与分区关键词推断 OCR 文本布局 */
export function detectLayout(cells: OcrCell[]): OcrLayoutType {
  const rows = clusterRows(cells);
  if (!rows.length) {
    return "key_value";
  }

  const avgCellsPerRow = rows.reduce((sum, row) => sum + row.length, 0) / rows.length;
  const hasSectionTitles = cells.some(cell => SECTION_KEYWORDS.some(kw => cell.text.includes(kw)));
  const wideRows = rows.filter(row => row.length >= 4).length;

  if (avgCellsPerRow >= 4 || wideRows >= Math.max(1, Math.floor(rows.length * 0.3))) {
    return "wide_table";
  }

  if (hasSectionTitles && avgCellsPerRow >= 2.5) {
    return "mixed";
  }

  if (avgCellsPerRow <= 2.2) {
    return "key_value";
  }

  return "mixed";
}

/** 将 OCR 单元格按行排列，便于大模型理解宽表文本 */
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

/** 键值对布局：每行尝试配对「标签 + 金额」 */
export function formatOcrAsKeyValueText(cells: OcrCell[]): string {
  const rows = clusterRows(cells);
  if (!rows.length) {
    return "";
  }

  const lines: string[] = ["【键值对布局】"];

  for (const row of rows) {
    if (row.length === 1) {
      lines.push(row[0].text);
      continue;
    }

    const amounts = row.filter(cell => isAmount(cell.text));
    const labels = row.filter(cell => !isAmount(cell.text));

    if (amounts.length === 1 && labels.length >= 1) {
      lines.push(`${labels.map(c => c.text).join("")}: ${amounts[0].text}`);
      continue;
    }

    if (row.length === 2) {
      const [a, b] = row;
      if (isAmount(a.text)) {
        lines.push(`${b.text}: ${a.text}`);
      } else if (isAmount(b.text)) {
        lines.push(`${a.text}: ${b.text}`);
      } else {
        lines.push(`${a.text} ${b.text}`);
      }
      continue;
    }

    lines.push(row.map(cell => cell.text).join(" | "));
  }

  return lines.join("\n");
}

/** 分区块布局：遇分区标题插入段落标记 */
export function formatOcrAsMixedText(cells: OcrCell[]): string {
  const rows = clusterRows(cells);
  if (!rows.length) {
    return "";
  }

  const lines: string[] = ["【混合布局：含分区标题】"];
  let currentSection = "";

  for (const row of rows) {
    const rowText = row.map(cell => cell.text).join("\t");
    const sectionHit = SECTION_KEYWORDS.find(kw => rowText.includes(kw) && !row.some(cell => isAmount(cell.text)));

    if (sectionHit && row.length <= 2) {
      currentSection = rowText;
      lines.push(`--- ${currentSection} ---`);
      continue;
    }

    if (row.length >= 4) {
      lines.push(`第${lines.length}行: ${rowText}`);
    } else if (row.length === 2 && isAmount(row[1].text)) {
      lines.push(`${row[0].text}: ${row[1].text}`);
    } else {
      lines.push(rowText);
    }
  }

  return lines.join("\n");
}

/** 按检测到的布局选择 formatter */
export function formatForLlm(cells: OcrCell[], layout?: OcrLayoutType): string {
  const resolved = layout ?? detectLayout(cells);

  switch (resolved) {
    case "wide_table":
      return formatOcrAsTableText(cells);
    case "key_value":
      return formatOcrAsKeyValueText(cells);
    case "mixed":
      return formatOcrAsMixedText(cells);
    default:
      return formatOcrAsTableText(cells);
  }
}

/** 无 box 坐标时的兜底：按顺序拼接 text 字段 */
export function extractPlainText(data: unknown): string {
  if (typeof data === "string") {
    return data.trim();
  }

  if (!Array.isArray(data)) {
    return "";
  }

  return data
    .map(item => (typeof item === "string" ? item : ((item as { text?: string })?.text ?? "")))
    .filter(Boolean)
    .join("\n")
    .trim();
}
