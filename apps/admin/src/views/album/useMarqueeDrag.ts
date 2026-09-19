/**
 * 鼠标左键拖拽框选
 * 职责：移动超过几像素后画选框、贴边自动滚、吞掉随后的 click 与图片原生拖拽
 * 适用：相册宫格（几何命中）与同步抽屉宫格（DOM 命中）；勾选怎么写入由调用方决定
 * @note 选框坐标相对 frameEl（overlay 的定位父级）。一拖就框选，不长按
 */
import type { CSSProperties } from "vue";
import { onScopeDispose } from "vue";

/** 选框矩形（相对 frameEl，宽高为正） */
export interface MarqueeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** pointerdown 时传入的滚动容器与选框坐标系 */
export interface MarqueeDragHost {
  scrollEl: HTMLElement;
  frameEl: HTMLElement;
}

/** 按下后移动超过此距离才开始框选，避免和单击抢 */
const MOVE_SLOP_PX = 4;
/** 框过小视为没拖开，不改当前勾选 */
export const MIN_MARQUEE_PX = 4;
const AUTOSCROLL_EDGE_PX = 36;
const AUTOSCROLL_MAX_PX = 18;

/** 可框选格子上的 key；没有该属性的格子不参与命中 */
export const MARQUEE_KEY_ATTR = "data-marquee-key";

function normalizeBox(ax: number, ay: number, bx: number, by: number): MarqueeBox {
  const left = Math.min(ax, bx);
  const top = Math.min(ay, by);
  return {
    left,
    top,
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay)
  };
}

function rectsOverlap(a: DOMRect, left: number, top: number, right: number, bottom: number): boolean {
  return a.left < right && a.right > left && a.top < bottom && a.bottom > top;
}

/**
 * 与选框相交的格子 key（只认带 data-marquee-key 的元素）
 * @param frame 与选框同一坐标系的定位父级
 */
export function hitTestMarqueeKeys(frame: HTMLElement, box: MarqueeBox): string[] {
  const frameRect = frame.getBoundingClientRect();
  const left = frameRect.left + box.left;
  const top = frameRect.top + box.top;
  const right = left + box.width;
  const bottom = top + box.height;
  const keys: string[] = [];
  const nodes = frame.querySelectorAll<HTMLElement>(`[${MARQUEE_KEY_ATTR}]`);
  nodes.forEach(el => {
    const key = el.getAttribute(MARQUEE_KEY_ATTR)?.trim();
    if (!key) return;
    if (!rectsOverlap(el.getBoundingClientRect(), left, top, right, bottom)) return;
    keys.push(key);
  });
  return keys;
}

export interface MarqueeDragHandlers {
  /** 刚越过移动阈值、开始画框 */
  onBegin: () => void;
  /** 拖动中；框过小由调用方决定是否还原勾选 */
  onUpdate: (box: MarqueeBox) => void;
  /**
   * 结束
   * @param committed 松手为 true；取消或卸载为 false，调用方应还原 onBegin 前的勾选
   */
  onEnd: (committed: boolean) => void;
}

/**
 * 绑定到滚动容器的拖拽框选
 * @note 忽略输入控件；带 data-marquee-key 的 button（QQ 宫格格本身是 button）仍可起框
 */
export function useMarqueeDrag(handlers: MarqueeDragHandlers) {
  const marquee = ref<MarqueeBox | null>(null);
  const marqueeActive = ref(false);

  const marqueeStyle = computed<CSSProperties | null>(() => {
    const box = marquee.value;
    if (!box) return null;
    return {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`
    };
  });

  let pressing = false;
  let dragging = false;
  let pointerId = -1;
  let startClientX = 0;
  let startClientY = 0;
  let anchorX = 0;
  let anchorY = 0;
  let autoScrollRaf = 0;
  let scrollEl: HTMLElement | null = null;
  let frameEl: HTMLElement | null = null;
  let lastClientX = 0;
  let lastClientY = 0;
  let bodyUserSelect = "";

  function toFrame(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!frameEl) return null;
    const rect = frameEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function updateFromClient(clientX: number, clientY: number) {
    const point = toFrame(clientX, clientY);
    if (!point) return;
    const box = normalizeBox(anchorX, anchorY, point.x, point.y);
    marquee.value = box;
    handlers.onUpdate(box);
  }

  function stopAutoScroll() {
    if (autoScrollRaf) {
      cancelAnimationFrame(autoScrollRaf);
      autoScrollRaf = 0;
    }
  }

  function autoScrollTick() {
    autoScrollRaf = 0;
    if (!dragging || !scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    const fromTop = lastClientY - rect.top;
    const fromBottom = rect.bottom - lastClientY;
    let delta = 0;
    if (fromTop < AUTOSCROLL_EDGE_PX) {
      delta = -AUTOSCROLL_MAX_PX * (1 - Math.max(0, fromTop) / AUTOSCROLL_EDGE_PX);
    } else if (fromBottom < AUTOSCROLL_EDGE_PX) {
      delta = AUTOSCROLL_MAX_PX * (1 - Math.max(0, fromBottom) / AUTOSCROLL_EDGE_PX);
    }
    if (delta !== 0) {
      scrollEl.scrollTop += delta;
      updateFromClient(lastClientX, lastClientY);
    }
    autoScrollRaf = requestAnimationFrame(autoScrollTick);
  }

  function armClickSuppress() {
    const stop = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      window.removeEventListener("click", stop, true);
    };
    window.addEventListener("click", stop, true);
    window.setTimeout(() => window.removeEventListener("click", stop, true), 500);
  }

  function restoreBodySelect() {
    document.body.style.userSelect = bodyUserSelect;
  }

  function detachWindowListeners() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
  }

  function finishPress(committed: boolean) {
    detachWindowListeners();
    stopAutoScroll();
    const wasDragging = dragging;
    pressing = false;
    dragging = false;
    marqueeActive.value = false;
    marquee.value = null;
    if (scrollEl?.hasPointerCapture(pointerId)) {
      try {
        scrollEl.releasePointerCapture(pointerId);
      } catch {
        // 指针已松开时 release 可能抛错
      }
    }
    if (wasDragging) {
      restoreBodySelect();
      handlers.onEnd(committed);
    }
    scrollEl = null;
    frameEl = null;
  }

  function beginDrag() {
    if (!pressing || !frameEl) return;
    const origin = toFrame(startClientX, startClientY);
    if (!origin) return;
    dragging = true;
    marqueeActive.value = true;
    anchorX = origin.x;
    anchorY = origin.y;
    bodyUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    armClickSuppress();
    handlers.onBegin();
    try {
      scrollEl?.setPointerCapture(pointerId);
    } catch {
      // 捕获失败仍靠 window 监听收尾
    }
    updateFromClient(startClientX, startClientY);
    autoScrollRaf = requestAnimationFrame(autoScrollTick);
  }

  function onPointerMove(event: PointerEvent) {
    if (!pressing || event.pointerId !== pointerId) return;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    if (!dragging) {
      const dx = event.clientX - startClientX;
      const dy = event.clientY - startClientY;
      if (dx * dx + dy * dy <= MOVE_SLOP_PX * MOVE_SLOP_PX) return;
      beginDrag();
    }
    if (!dragging) return;
    event.preventDefault();
    updateFromClient(event.clientX, event.clientY);
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    finishPress(true);
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    finishPress(false);
  }

  /**
   * 挂在滚动容器的 pointerdown
   * 几乎不动仍当点击；一拖就画框
   */
  function onPointerDown(event: PointerEvent, host: MarqueeDragHost) {
    if (event.button !== 0) return;
    if (event.pointerType && event.pointerType !== "mouse") return;
    if (pressing) return;
    const target = event.target;
    if (target instanceof Element) {
      const interactive = target.closest("button, a, input, textarea, select");
      // 宫格格本身是 button 时带 key，不能当成工具栏按钮丢掉
      if (interactive && !interactive.matches(`[${MARQUEE_KEY_ATTR}]`)) return;
    }
    pressing = true;
    pointerId = event.pointerId;
    startClientX = event.clientX;
    startClientY = event.clientY;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
    scrollEl = host.scrollEl;
    frameEl = host.frameEl;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  }

  /** 盖掉缩略图原生拖拽，否则一拖就变成浏览器拖图片 */
  function onDragStart(event: DragEvent) {
    event.preventDefault();
  }

  onScopeDispose(() => finishPress(false));

  return {
    marqueeStyle,
    marqueeActive,
    onPointerDown,
    onDragStart
  };
}
