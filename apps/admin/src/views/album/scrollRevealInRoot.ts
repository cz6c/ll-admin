/**
 * 滚动容器内定位子元素
 * 职责：同步 Fab 抽屉宫格在灯箱关闭后滚回当前项（非虚拟滚动场景）
 * 适用：iCloud / QQ 空间同步抽屉
 */

export interface ScrollRevealOptions {
  /** 垂直对齐：center 尽量居中，nearest 仅露出 */
  block?: "center" | "nearest" | "start";
  behavior?: ScrollBehavior;
}

/**
 * 在指定 scrollRoot 内滚到 target，不依赖 scrollIntoView（避免整页跳动）
 */
export function scrollRevealInRoot(scrollRoot: HTMLElement | null | undefined, target: Element | null | undefined, options: ScrollRevealOptions = {}) {
  if (!scrollRoot || !target || !(target instanceof HTMLElement)) return;
  const { block = "center", behavior = "auto" } = options;
  const rootRect = scrollRoot.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const viewH = scrollRoot.clientHeight;
  let delta = 0;
  if (block === "center") {
    delta = targetRect.top + targetRect.height / 2 - (rootRect.top + viewH / 2);
  } else if (block === "start") {
    delta = targetRect.top - rootRect.top;
  } else {
    if (targetRect.top < rootRect.top) delta = targetRect.top - rootRect.top;
    else if (targetRect.bottom > rootRect.bottom) delta = targetRect.bottom - rootRect.bottom;
  }
  if (Math.abs(delta) < 1) return;
  scrollRoot.scrollBy({ top: delta, behavior });
}
