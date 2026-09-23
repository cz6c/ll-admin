/**
 * 相册右侧按年窗口挂载
 * 职责：首屏只挂最新年、滚到顶/底扩邻年、点轴/上下键切年、钉底与 scroll 补偿
 * 适用：album/index.vue；discover 仍全库，本模块只管已挂载 yearKeys
 */
import type { ComputedRef, Ref } from "vue";
import { neighborYearKey, pickLatestYearKey, stepAlbumYear, type AlbumAxisYear } from "./albumYearAxis";
import type { AlbumDayLayout } from "./albumDayLayout";
import type { MediaFile } from "./types";

/** 滚到顶/底约两行内触发邻年挂载 */
export const ALBUM_YEAR_EDGE_PX = 120;

export interface UseAlbumYearWindowOptions {
  /** 右侧已挂载年份；由页面创建以便先算 displayFiles / dayLayout */
  loadedYearKeys: Ref<string[]>;
  yearAxis: ComputedRef<AlbumAxisYear[]>;
  dayLayout: ComputedRef<AlbumDayLayout>;
  displayFiles: ComputedRef<MediaFile[]>;
  scrollEl: Ref<HTMLElement | null>;
  scrollTop: Ref<number>;
  viewportHeight: Ref<number>;
  totalHeight: ComputedRef<number>;
  /** 目录筛选变化时重置窗口 */
  dirFilter: Ref<string | null>;
  /** 改拍摄时间 / 灯箱 / 重复清理打开时忽略年份快捷键 */
  captureRewriteOpen: Ref<boolean>;
  viewerOpen: Ref<boolean> | ComputedRef<boolean>;
  duplicateModalOpen: Ref<boolean>;
  /** 高亮年（可视区顶部日所属年） */
  activeYearKey: ComputedRef<string>;
}

/**
 * 年份挂载窗口与边缘扩年、键盘切年
 * @param options 轴 / 日布局 / 滚动容器与弹层开关
 */
export function useAlbumYearWindow(options: UseAlbumYearWindowOptions) {
  const {
    loadedYearKeys,
    yearAxis,
    dayLayout,
    displayFiles,
    scrollEl,
    scrollTop,
    viewportHeight,
    totalHeight,
    dirFilter,
    captureRewriteOpen,
    viewerOpen,
    duplicateModalOpen,
    activeYearKey
  } = options;

  /** 扫完/筛完/点最新年时钉在底部；往上扩年时关掉，避免把视口拽走 */
  let preferBottom = true;
  /** 邻年挂载中，避免滚动边缘连触发 */
  let yearLoadLocked = false;
  /** 程序化滚底后短暂忽略边缘扩年，避免首屏钉底立刻挂上下一年 */
  let suppressEdgeUntil = 0;

  /**
   * 重置为只挂最新一年并滚到底
   * 扫描完成、目录筛选变化时调用
   */
  function resetYearWindowToLatest() {
    const latest = pickLatestYearKey(yearAxis.value);
    loadedYearKeys.value = latest ? [latest] : [];
    preferBottom = true;
    scrollAlbumToBottom();
  }

  /** 滚到最新一端 */
  function scrollAlbumToBottom() {
    suppressEdgeUntil = Date.now() + 500;
    const apply = () => {
      const el = scrollEl.value;
      if (!el) return;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = max;
      scrollTop.value = max;
    };
    nextTick(() => {
      apply();
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(apply);
      });
    });
  }

  function scrollAlbumToTop() {
    suppressEdgeUntil = Date.now() + 500;
    const el = scrollEl.value;
    if (!el) return;
    el.scrollTop = 0;
    scrollTop.value = 0;
  }

  /**
   * 点击 / 键盘切到某年：只挂该年
   * 最新一年钉底，其它年从该年第一天顶起
   */
  function focusYear(yearKey: string) {
    if (!yearKey || !yearAxis.value.some(year => year.key === yearKey)) return;
    const latest = pickLatestYearKey(yearAxis.value);
    loadedYearKeys.value = [yearKey];
    preferBottom = yearKey === latest;
    nextTick(() => {
      if (preferBottom) scrollAlbumToBottom();
      else scrollAlbumToTop();
    });
  }

  /** 往上：在已挂载窗口顶部插入更早一年，并补偿 scrollTop */
  async function loadPrevYear() {
    if (yearLoadLocked) return;
    const first = loadedYearKeys.value[0];
    if (!first) return;
    const prev = neighborYearKey(yearAxis.value, first, -1);
    if (!prev || loadedYearKeys.value.includes(prev)) return;
    yearLoadLocked = true;
    preferBottom = false;
    const beforeHeight = dayLayout.value.totalHeight;
    loadedYearKeys.value = [prev, ...loadedYearKeys.value];
    await nextTick();
    const added = dayLayout.value.totalHeight - beforeHeight;
    const el = scrollEl.value;
    if (el && added > 0) {
      el.scrollTop += added;
      scrollTop.value = el.scrollTop;
    }
    yearLoadLocked = false;
  }

  /** 往下：在窗口底部接上更晚一年（或未知） */
  async function loadNextYear() {
    if (yearLoadLocked) return;
    const last = loadedYearKeys.value[loadedYearKeys.value.length - 1];
    if (!last) return;
    const next = neighborYearKey(yearAxis.value, last, 1);
    if (!next || loadedYearKeys.value.includes(next)) return;
    yearLoadLocked = true;
    preferBottom = false;
    loadedYearKeys.value = [...loadedYearKeys.value, next];
    await nextTick();
    yearLoadLocked = false;
  }

  /**
   * 上下键只切年份（改挂载窗口）
   * 目录树、弹层里的方向键留给控件自己
   */
  function shouldIgnoreYearKey(event: KeyboardEvent): boolean {
    if (event.altKey || event.ctrlKey || event.metaKey) return true;
    if (captureRewriteOpen.value || viewerOpen.value || duplicateModalOpen.value) return true;
    const el = event.target;
    if (!(el instanceof HTMLElement)) return false;
    return !!el.closest("input, textarea, select, [contenteditable='true'], .ant-select, .ant-picker, .ant-modal, .ant-drawer, .ant-dropdown");
  }

  function onAlbumYearKey(event: KeyboardEvent) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (shouldIgnoreYearKey(event) || yearAxis.value.length === 0) return;
    const delta = event.key === "ArrowUp" ? -1 : 1;
    const next = stepAlbumYear(yearAxis.value, activeYearKey.value || loadedYearKeys.value[0] || "", delta);
    if (!next) return;
    event.preventDefault();
    focusYear(next.key);
  }

  watch(dirFilter, () => {
    resetYearWindowToLatest();
  });

  /** 目录或元数据变化导致年份表变了时，丢掉已不存在的挂载年 */
  watch(yearAxis, years => {
    if (years.length === 0) {
      loadedYearKeys.value = [];
      return;
    }
    const alive = new Set(years.map(year => year.key));
    const kept = loadedYearKeys.value.filter(key => alive.has(key));
    if (kept.length === 0) resetYearWindowToLatest();
    else if (kept.length !== loadedYearKeys.value.length) loadedYearKeys.value = kept;
  });

  /** 首帧高度为 0 时钉底；扩年时 preferBottom=false 不抢视口 */
  watch([totalHeight, viewportHeight], () => {
    if (!preferBottom || totalHeight.value <= 0) return;
    scrollAlbumToBottom();
  });

  /** 滚到顶/底挂邻年 */
  watch(scrollTop, () => {
    const el = scrollEl.value;
    if (!el || yearLoadLocked || displayFiles.value.length === 0) return;
    if (Date.now() < suppressEdgeUntil) return;
    if (scrollTop.value <= ALBUM_YEAR_EDGE_PX) void loadPrevYear();
    const distanceBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceBottom <= ALBUM_YEAR_EDGE_PX) void loadNextYear();
  });

  return {
    resetYearWindowToLatest,
    focusYear,
    onAlbumYearKey,
    yearEdgePx: ALBUM_YEAR_EDGE_PX
  };
}
