/**
 * 相册宫格布局常量与 fluid 尺寸计算
 * 职责：宫格 gap/padding、按容器宽度均分列宽（扁平全宽、无侧栏）
 * 适用：album/index.vue 虚拟滚动宫格 UI；缩略图生成分辨率见 types.ts ALBUM_THUMB_GENERATE_SIZE
 * @note CS 最小内宽 1228（见 `CS_WINDOW_MIN_INNER_WIDTH` / tauri minWidth），不做更窄断点
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
  /** 算列数时的目标格宽（非最终宽度）；160 → 1228 约 7 列、1920 约 11 列 */
  targetThumb: 160,
  /** 显示格宽上限；避免相对 158px 缓存过度放大发糊 */
  thumbMax: 220,
  /** 列数下限（CS 最小宽下天然 ≥ 此值） */
  minCols: 5,
  /** 扁平全宽：提高上限，减少宽屏 8 列 + thumbMax 顶死后的右侧留白 */
  maxCols: 12,
  bufferRows: 4
} as const;

/**
 * 根据宫格可用宽度计算列数与均分缩略图边长，尽量填满行宽
 * @param availWidth thumb-canvas 内容区宽度（scroll 宽 − 左右 padding）
 */
export function computeAlbumGridLayout(availWidth: number): AlbumGridLayout {
  const { gridGap, targetThumb, thumbMax, minCols, maxCols } = ALBUM_LAYOUT;

  if (availWidth <= 0) {
    return { cols: 1, thumbSize: targetThumb, rowHeight: targetThumb + gridGap };
  }

  let cols = Math.max(minCols, Math.min(maxCols, Math.floor((availWidth + gridGap) / (targetThumb + gridGap))));

  let thumbSize = Math.floor((availWidth - (cols - 1) * gridGap) / cols);

  // 格宽超过上限：在 maxCols 内尽量加列，再均分，减少右侧空带
  if (thumbSize > thumbMax) {
    cols = Math.max(minCols, Math.min(maxCols, Math.floor((availWidth + gridGap) / (thumbMax + gridGap))));
    thumbSize = Math.floor((availWidth - (cols - 1) * gridGap) / cols);
  }

  thumbSize = Math.min(thumbMax, Math.max(1, thumbSize));

  return {
    cols: Math.max(1, cols),
    thumbSize,
    rowHeight: thumbSize + gridGap
  };
}
