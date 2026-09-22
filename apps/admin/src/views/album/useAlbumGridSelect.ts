/**
 * 相册宫格勾选
 * 职责：工具栏勾选模式（点格切换，对齐 iCloud / QQ 同步宫格）+ 鼠标左键拖拽框选（累加）
 * 适用：album/index.vue 按日分组虚拟滚动宫格
 * @note 拖拽手势在 useMarqueeDrag；命中用缩略图绝对矩形，不命中日标题；框选并入拖前已选，不替换
 */
import type { Ref } from "vue";
import type { AlbumThumbPlacement } from "./albumDayLayout";
import { hitTestThumbPlacements } from "./albumDayLayout";
import type { MediaFile } from "./types";
import { MIN_MARQUEE_PX, useMarqueeDrag, type MarqueeBox } from "./useMarqueeDrag";

/** 框选矩形（canvas 坐标，宽高为正） */
export type AlbumMarqueeBox = MarqueeBox;

export interface AlbumGridSelectHost {
  scrollEl: HTMLElement;
  canvasEl: HTMLElement;
}

/**
 * 宫格勾选状态与指针框选
 * @param files 当前已挂载年份内的媒体（顺序即勾选输出序）
 * @param placements 全量缩略图绝对坐标（含未挂 DOM 的）
 */
export function useAlbumGridSelect(files: Ref<MediaFile[]>, placements: Ref<AlbumThumbPlacement[]>) {
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

  /**
   * 框选累加：本轮命中并入拖前快照；框内移出的项若原先未选则去掉，快照里已有的保留
   */
  function applyMarquee(box: AlbumMarqueeBox) {
    if (box.width < MIN_MARQUEE_PX && box.height < MIN_MARQUEE_PX) {
      if (snapshot) selectedPaths.value = new Set(snapshot);
      return;
    }
    const next = new Set(snapshot ?? []);
    for (const path of hitTestThumbPlacements(placements.value, box)) {
      next.add(path);
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
