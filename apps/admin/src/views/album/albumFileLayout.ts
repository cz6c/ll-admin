/**
 * 文件资源模式宫格虚拟滚动布局
 * 职责：文件夹+媒体扁平铺绝对坐标，按可视区切片
 * 适用：AlbumFileBrowser；单元格统一高度（方图+文案），文件夹字形在格内自适配
 */

import { ALBUM_LAYOUT } from "./albumLayout";
import type { AlbumFileFolder } from "./albumFileBrowser";
import type { MediaFile } from "./types";

/** 图标与文件名间距 */
export const FILE_ITEM_NAME_GAP = 8;
/** 文件名行高（与样式一致） */
export const FILE_ITEM_NAME_H = 16;
/** 格内上下内边距合计（与 `.folder-tile` / `.file-tile` padding 一致；原 20 偏疏） */
export const FILE_ITEM_PAD_Y = 8;

/** 网格项：文件夹或媒体 */
export type AlbumFileGridItem =
  | { kind: "folder"; key: string; folder: AlbumFileFolder }
  | { kind: "file"; key: string; file: MediaFile };

export interface AlbumFilePlacement {
  item: AlbumFileGridItem;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AlbumFileLayout {
  placements: AlbumFilePlacement[];
  totalHeight: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
}

/**
 * 文件夹在前、媒体在后，供铺格
 */
export function buildAlbumFileGridItems(folders: AlbumFileFolder[], files: MediaFile[]): AlbumFileGridItem[] {
  const items: AlbumFileGridItem[] = [];
  for (const folder of folders) {
    items.push({ kind: "folder", key: `dir:${folder.relPath}`, folder });
  }
  for (const file of files) {
    items.push({ kind: "file", key: `file:${file.path}`, file });
  }
  return items;
}

/**
 * 单元格高度：缩略图边长 + 间距 + 文件名 + 上下垫
 */
export function albumFileCellHeight(thumbSize: number): number {
  return thumbSize + FILE_ITEM_NAME_GAP + FILE_ITEM_NAME_H + FILE_ITEM_PAD_Y;
}

/**
 * 按列均分铺绝对坐标（文件夹与媒体同一格尺）
 */
export function buildAlbumFileLayout(
  items: AlbumFileGridItem[],
  cols: number,
  cellWidth: number,
  cellHeight: number,
  gapX = ALBUM_LAYOUT.gridGap,
  gapY = ALBUM_LAYOUT.gridGap
): AlbumFileLayout {
  if (items.length === 0 || cols <= 0 || cellWidth <= 0 || cellHeight <= 0) {
    return { placements: [], totalHeight: 0, cols: Math.max(1, cols), cellWidth, cellHeight };
  }

  const placements: AlbumFilePlacement[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    placements.push({
      item,
      left: col * (cellWidth + gapX),
      top: row * (cellHeight + gapY),
      width: cellWidth,
      height: cellHeight
    });
  }

  const rows = Math.ceil(items.length / cols);
  const totalHeight = rows > 0 ? rows * cellHeight + (rows - 1) * gapY : 0;
  return { placements, totalHeight, cols, cellWidth, cellHeight };
}

/**
 * 可视区命中的格子（含缓冲）
 */
export function sliceVisibleFilePlacements(
  placements: AlbumFilePlacement[],
  scrollY: number,
  viewportHeight: number,
  bufferPx: number
): AlbumFilePlacement[] {
  if (placements.length === 0 || viewportHeight <= 0) return [];
  const top = Math.max(0, scrollY - bufferPx);
  const bottom = scrollY + viewportHeight + bufferPx;
  return placements.filter(item => {
    const itemBottom = item.top + item.height;
    return item.top < bottom && itemBottom > top;
  });
}

/**
 * 框选命中：媒体加 path；文件夹经 expand 展开为媒体 path
 * @param expandFolder 返回该文件夹含子孙的媒体 path 列表
 */
export function hitTestFilePlacements(
  placements: AlbumFilePlacement[],
  box: { left: number; top: number; width: number; height: number },
  expandFolder: (relPath: string) => string[]
): string[] {
  const boxRight = box.left + box.width;
  const boxBottom = box.top + box.height;
  const hits = new Set<string>();
  for (const item of placements) {
    if (item.left >= boxRight || item.left + item.width <= box.left) continue;
    if (item.top >= boxBottom || item.top + item.height <= box.top) continue;
    if (item.item.kind === "file") {
      hits.add(item.item.file.path);
      continue;
    }
    for (const path of expandFolder(item.item.folder.relPath)) hits.add(path);
  }
  return [...hits];
}
