/**
 * iCloud 同步抽屉宫格虚拟布局
 * 职责：全量元数据铺绝对坐标，按可视区切片；框选按几何命中 rowKey
 * 适用：IcloudSyncFab（方案 3：全量轻量元数据 + 虚拟 DOM）
 */

/** 与抽屉 `.cloud-grid` 历史 minmax(112px) 对齐 */
export const ICLOUD_CLOUD_GRID = {
  minCell: 112,
  gap: 8,
  bufferRows: 3
} as const;

export interface IcloudCloudPlacement<T = { rowKey: string }> {
  row: T;
  rowKey: string;
  left: number;
  top: number;
  width: number;
  height: number;
  index: number;
}

export interface IcloudCloudLayout<T = { rowKey: string }> {
  placements: IcloudCloudPlacement<T>[];
  totalHeight: number;
  cols: number;
  cellSize: number;
}

/**
 * 按可用宽度算列数与均分格边长（方格）
 */
export function computeIcloudCloudGrid(availWidth: number): { cols: number; cellSize: number } {
  const { minCell, gap } = ICLOUD_CLOUD_GRID;
  if (availWidth <= 0) return { cols: 1, cellSize: minCell };
  const cols = Math.max(1, Math.floor((availWidth + gap) / (minCell + gap)));
  const cellSize = Math.max(minCell, Math.floor((availWidth - gap * (cols - 1)) / cols));
  return { cols, cellSize };
}

/**
 * 全量行 → 绝对坐标宫格
 */
export function buildIcloudCloudLayout<T extends { rowKey: string }>(
  rows: T[],
  cols: number,
  cellSize: number,
  gap = ICLOUD_CLOUD_GRID.gap
): IcloudCloudLayout<T> {
  if (rows.length === 0 || cols <= 0 || cellSize <= 0) {
    return { placements: [], totalHeight: 0, cols: Math.max(1, cols), cellSize };
  }
  const placements: IcloudCloudPlacement<T>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const col = i % cols;
    const r = Math.floor(i / cols);
    placements.push({
      row,
      rowKey: row.rowKey,
      left: col * (cellSize + gap),
      top: r * (cellSize + gap),
      width: cellSize,
      height: cellSize,
      index: i
    });
  }
  const rowCount = Math.ceil(rows.length / cols);
  const totalHeight = rowCount > 0 ? rowCount * cellSize + (rowCount - 1) * gap : 0;
  return { placements, totalHeight, cols, cellSize };
}

/**
 * 可视区切片（含行缓冲）
 */
export function sliceVisibleIcloudCloudPlacements<T>(
  placements: IcloudCloudPlacement<T>[],
  scrollY: number,
  viewportHeight: number,
  bufferPx: number
): IcloudCloudPlacement<T>[] {
  if (placements.length === 0 || viewportHeight <= 0) return [];
  const top = Math.max(0, scrollY - bufferPx);
  const bottom = scrollY + viewportHeight + bufferPx;
  return placements.filter(p => p.top < bottom && p.top + p.height > top);
}

/**
 * 框选矩形命中 rowKey（canvas 坐标；不依赖 DOM 是否挂载）
 */
export function hitTestIcloudCloudPlacements<T>(
  placements: IcloudCloudPlacement<T>[],
  box: { left: number; top: number; width: number; height: number }
): string[] {
  const boxRight = box.left + box.width;
  const boxBottom = box.top + box.height;
  const hits: string[] = [];
  for (const p of placements) {
    if (p.left >= boxRight || p.left + p.width <= box.left) continue;
    if (p.top >= boxBottom || p.top + p.height <= box.top) continue;
    hits.push(p.rowKey);
  }
  return hits;
}
