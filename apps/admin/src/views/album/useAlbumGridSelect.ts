/**
 * 相册宫格勾选（意图先行）
 * 职责：点「修改拍摄时间 / 删除」进入意图后点格切换 + 左键框选累加；空闲不可框选
 * 适用：album/index.vue 按日分组虚拟滚动宫格
 * @note 对齐 iCloud 抽屉意图先行；拖拽手势在 useMarqueeDrag；命中用缩略图绝对矩形
 */
import type { Ref } from "vue";
import type { AlbumThumbPlacement } from "./albumDayLayout";
import { hitTestThumbPlacements } from "./albumDayLayout";
import type { MediaFile } from "./types";
import { MIN_MARQUEE_PX, useMarqueeDrag, type MarqueeBox } from "./useMarqueeDrag";

/** 框选矩形（canvas 坐标，宽高为正） */
export type AlbumMarqueeBox = MarqueeBox;

/** 本地相册批量意图：改拍摄时间 / 删本地 */
export type AlbumSelectIntent = null | "captureAt" | "delete";

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
  const intent = ref<AlbumSelectIntent>(null);
  /** 有意图即勾选态（点格切换，不开预览） */
  const selectMode = computed(() => intent.value != null);
  const selectedPaths = ref<Set<string>>(new Set());

  /** 按当前宫格顺序输出已选 path，供改时间弹窗 / 批量删除 */
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

  function clearSelection() {
    selectedPaths.value = new Set();
  }

  /**
   * 进入或切换意图：清勾选
   * @param next captureAt | delete
   */
  function enterIntent(next: "captureAt" | "delete") {
    if (intent.value === next) return;
    clearSelection();
    intent.value = next;
  }

  function exitIntent() {
    intent.value = null;
    clearSelection();
  }

  function togglePath(path: string) {
    if (!intent.value) return;
    const next = new Set(selectedPaths.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selectedPaths.value = next;
  }

  /** 批量删除后从勾选里去掉已删 path，不退出意图 */
  function removePaths(paths: string[]) {
    if (paths.length === 0 || selectedPaths.value.size === 0) return;
    const drop = new Set(paths);
    const next = new Set<string>();
    for (const path of selectedPaths.value) {
      if (!drop.has(path)) next.add(path);
    }
    selectedPaths.value = next;
  }

  /**
   * 改拍摄时间改名后同步勾选 path（对象已就地改 path，集合仍是旧字符串）
   * @param renames from→to；to 为空则视为移除
   */
  function remapPaths(renames: { from: string; to: string }[]) {
    if (renames.length === 0 || selectedPaths.value.size === 0) return;
    const map = new Map(renames.map(r => [r.from, r.to]));
    let changed = false;
    const next = new Set<string>();
    for (const path of selectedPaths.value) {
      if (map.has(path)) {
        const to = map.get(path)?.trim();
        changed = true;
        if (to) next.add(to);
      } else {
        next.add(path);
      }
    }
    if (changed) selectedPaths.value = next;
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
   * 框选累加：本轮命中并入拖前快照；仅意图内有效
   */
  function applyMarquee(box: AlbumMarqueeBox) {
    if (!intent.value) return;
    if (box.width < MIN_MARQUEE_PX && box.height < MIN_MARQUEE_PX) {
      if (snapshot) selectedPaths.value = new Set(snapshot);
      return;
    }
    const next = new Set(snapshot ?? []);
    for (const path of hitTestThumbPlacements(placements.value, box)) {
      next.add(path);
    }
    selectedPaths.value = next;
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
      snapshot = null;
    }
  });

  function onPointerDown(event: PointerEvent, host: AlbumGridSelectHost) {
    if (!intent.value) return;
    onMarqueePointerDown(event, { scrollEl: host.scrollEl, frameEl: host.canvasEl });
  }

  return {
    intent,
    selectMode,
    orderedPaths,
    marqueeStyle,
    marqueeActive,
    isSelected,
    enterIntent,
    exitIntent,
    togglePath,
    removePaths,
    remapPaths,
    onPointerDown,
    onDragStart
  };
}
