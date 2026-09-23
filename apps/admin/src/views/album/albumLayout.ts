/**
 * 相册宫格布局常量与 fluid 尺寸计算
 * 职责：宫格 gap/padding、按右侧照片墙宽度均分列宽（左侧年份轴不计入这份宽度）
 * 适用：album/index.vue 按日分组虚拟滚动
 * @note CS 最小内宽 1228（见 `CS_WINDOW_MIN_INNER_WIDTH` / tauri minWidth），不做更窄断点
 * @note 日标题高度见 albumDayLayout.DAY_HEADER_HEIGHT，不计入本文件 rowHeight
 * @note 仅用 targetThumb 估列并均分；不加 thumbMax / minCols / maxCols——宽屏靠加列填满，格宽自然贴在 target 附近
 * @note 磁盘 WebP 边长固定约 316（见 `ALBUM_THUMB_GENERATE_SIZE`），已覆盖本布局主流 DPR；勿为对齐格宽单独改生成尺寸
 */

/** 宫格布局单次计算结果 */
export interface AlbumGridLayout {
  /** 当前行内列数 */
  cols: number;
  /** 均分后的缩略图边长（px，整数） */
  thumbSize: number;
  /** 虚拟滚动行高 = thumbSize + gridGap */
  rowHeight: number;
}

export const ALBUM_LAYOUT = {
  gridGap: 8,
  gridPadding: 8,
  /** 算列数时的目标格宽（CSS px）；1228 约 6 列、1920 约 10 列，格宽贴在此值附近 */
  targetThumb: 180,
  bufferRows: 4
} as const;

/**
 * 根据宫格可用宽度计算列数与均分缩略图边长，尽量填满行宽
 * @param availWidth thumb-canvas 内容区宽度（scroll 宽 − 左右 padding）
 */
export function computeAlbumGridLayout(availWidth: number): AlbumGridLayout {
  const { gridGap, targetThumb } = ALBUM_LAYOUT;

  if (availWidth <= 0) {
    return { cols: 1, thumbSize: targetThumb, rowHeight: targetThumb + gridGap };
  }

  const cols = Math.max(1, Math.floor((availWidth + gridGap) / (targetThumb + gridGap)));
  const thumbSize = Math.max(1, Math.floor((availWidth - (cols - 1) * gridGap) / cols));

  return {
    cols,
    thumbSize,
    rowHeight: thumbSize + gridGap
  };
}
