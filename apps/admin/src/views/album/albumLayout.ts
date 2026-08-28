/**
 * 相册宫格布局常量与 fluid 尺寸计算
 * 职责：侧栏 clamp、宫格 gap/padding、按容器宽度均分列宽（方案 A）
 * 适用：album/index.vue 虚拟滚动宫格 UI；缩略图生成分辨率见 types.ts ALBUM_THUMB_GENERATE_SIZE
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
  /** 侧栏 CSS clamp：1228≈200px，1920≈248px */
  sidebarWidthCss: "clamp(200px, 15vw, 248px)",
  gridGap: 8,
  gridPadding: 8,
  /** 算列数时的目标格宽（非最终宽度）；182 → 1920 全屏约 8 列、1228 约 5 列 */
  targetThumb: 182,
  /** 显示格宽上限；超宽屏 maxCols 顶满时防止相对 158px 缓存过度放大 */
  thumbMax: 220,
  minCols: 5,
  maxCols: 8,
  /** 可用宽 ≥ 此值才强制 minCols（5×140 + 4×gap，语义：五列时每格至少约 140px） */
  minAvailForMinCols: 732,
  bufferRows: 4
} as const;

/**
 * 根据宫格可用宽度计算列数与均分缩略图边长，尽量填满行宽
 * @param availWidth thumb-canvas 内容区宽度（scroll 宽 − 左右 padding）
 */
export function computeAlbumGridLayout(availWidth: number): AlbumGridLayout {
  const { gridGap, targetThumb, thumbMax, minCols, maxCols, minAvailForMinCols } = ALBUM_LAYOUT;

  if (availWidth <= 0) {
    return { cols: 1, thumbSize: targetThumb, rowHeight: targetThumb + gridGap };
  }

  let cols = Math.max(1, Math.min(maxCols, Math.floor((availWidth + gridGap) / (targetThumb + gridGap))));
  if (availWidth >= minAvailForMinCols) {
    cols = Math.max(cols, minCols);
  }
  cols = Math.min(maxCols, cols);

  let thumbSize = Math.floor((availWidth - (cols - 1) * gridGap) / cols);

  if (thumbSize > thumbMax) {
    cols = Math.max(1, Math.min(maxCols, Math.floor((availWidth + gridGap) / (thumbMax + gridGap))));
    thumbSize = Math.floor((availWidth - (cols - 1) * gridGap) / cols);
  }

  thumbSize = Math.min(thumbMax, Math.max(1, thumbSize));

  return {
    cols: Math.max(1, cols),
    thumbSize,
    rowHeight: thumbSize + gridGap
  };
}
