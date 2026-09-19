/**
 * 相册宫格勾选
 * 职责：工具栏勾选模式（点格切换，对齐 iCloud / QQ 同步宫格）+ 鼠标左键拖拽框选
 * 适用：album/index.vue 虚拟滚动宫格
 * @note 拖拽手势在 useMarqueeDrag；本文件只按布局几何把框译成 path。框选命中全量项，不看卡片是否已挂上 DOM
 */
import type { Ref } from "vue";
import type { MediaFile } from "./types";
import { MIN_MARQUEE_PX, useMarqueeDrag, type MarqueeBox } from "./useMarqueeDrag";

/** 与 albumLayout 宫格定位一致的几何；坐标原点是 thumb-canvas */
export interface AlbumGridGeometry {
  /** 列数 */
  cols: number;
  /** 缩略图边长（px） */
  thumbSize: number;
  /** 行高 = thumbSize + gap */
  rowHeight: number;
  /** 格间距（px） */
  gap: number;
}

/** 框选矩形（canvas 坐标，宽高为正） */
export type AlbumMarqueeBox = MarqueeBox;

export interface AlbumGridSelectHost {
  scrollEl: HTMLElement;
  canvasEl: HTMLElement;
}

/**
 * 与框相交的宫格下标（含只擦到边的格）
 * @param count 当前筛选后的媒体条数
 */
export function hitTestAlbumGrid(count: number, geometry: AlbumGridGeometry, box: AlbumMarqueeBox): number[] {
  const { cols, thumbSize, rowHeight, gap } = geometry;
  if (count <= 0 || cols <= 0 || thumbSize <= 0 || rowHeight <= 0) return [];
  const hits: number[] = [];
  const cell = thumbSize + gap;
  const boxRight = box.left + box.width;
  const boxBottom = box.top + box.height;
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * cell;
    const top = row * rowHeight;
    const right = left + thumbSize;
    const bottom = top + thumbSize;
    if (left < boxRight && right > box.left && top < boxBottom && bottom > box.top) {
      hits.push(i);
    }
  }
  return hits;
}

/**
 * 宫格勾选状态与指针框选
 * @param files 当前筛选结果（顺序即宫格下标）
 * @param geometry 随容器宽度变化的列宽/行高
 */
export function useAlbumGridSelect(files: Ref<MediaFile[]>, geometry: Ref<AlbumGridGeometry>) {
  const selectMode = ref(false);
  const selectedPaths = ref<Set<string>>(new Set());

  /** 按当前宫格顺序输出已选 path，供修改拍摄时间弹窗 */
  const orderedPaths = computed(() => {
    const picked = selectedPaths.value;
    if (picked.size === 0) return [] as string[];
    const out: string[] = [];
    for (const file of files.value) {
      if (picked.has(file.path)) out.push(file.path);
    }
    return out;
  });

  function isSelected(path: string): boolean {
    return selectedPaths.value.has(path);
  }

  function enterSelectMode() {
    selectMode.value = true;
  }

  function exitSelectMode() {
    selectMode.value = false;
    selectedPaths.value = new Set();
  }

  function togglePath(path: string) {
    const next = new Set(selectedPaths.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selectedPaths.value = next;
  }

  watch(files, list => {
    if (selectedPaths.value.size === 0) return;
    const alive = new Set(list.map(file => file.path));
    let changed = false;
    const next = new Set<string>();
    for (const path of selectedPaths.value) {
      if (alive.has(path)) next.add(path);
      else changed = true;
    }
    if (changed) selectedPaths.value = next;
  });

  /** 按下前的勾选；拖太短或取消时还原 */
  let snapshot: Set<string> | null = null;

  function applyMarquee(box: AlbumMarqueeBox) {
    if (box.width < MIN_MARQUEE_PX && box.height < MIN_MARQUEE_PX) {
      if (snapshot) selectedPaths.value = new Set(snapshot);
      return;
    }
    const indices = hitTestAlbumGrid(files.value.length, geometry.value, box);
    const next = new Set<string>();
    for (const index of indices) {
      const path = files.value[index]?.path;
      if (path) next.add(path);
    }
    selectedPaths.value = next;
    if (next.size > 0) selectMode.value = true;
  }

  const {
    marqueeStyle,
    marqueeActive,
    onPointerDown: onMarqueePointerDown,
    onDragStart
  } = useMarqueeDrag({
    onBegin() {
      snapshot = new Set(selectedPaths.value);
    },
    onUpdate: applyMarquee,
    onEnd(committed) {
      if (!committed && snapshot) selectedPaths.value = new Set(snapshot);
      else if (committed && selectedPaths.value.size > 0) selectMode.value = true;
      snapshot = null;
    }
  });

  function onPointerDown(event: PointerEvent, host: AlbumGridSelectHost) {
    onMarqueePointerDown(event, { scrollEl: host.scrollEl, frameEl: host.canvasEl });
  }

  return {
    selectMode,
    orderedPaths,
    marqueeStyle,
    marqueeActive,
    isSelected,
    enterSelectMode,
    exitSelectMode,
    togglePath,
    onPointerDown,
    onDragStart
  };
}
