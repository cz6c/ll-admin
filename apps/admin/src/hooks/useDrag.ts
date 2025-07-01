import { isFunction } from "@llcz/common";

export interface Position {
  x: number;
  y: number;
}

export interface UseDragOptions {
  dragElRef: Ref<HTMLElement | null>;
  wrapElRef?: Ref<HTMLElement | null>;
  initialValue?: Position;
  onStart?: (position: Position, event: MouseEvent) => void;
  onMove?: (left: number, top: number) => void;
  onEnd?: (position: Position, event: MouseEvent) => void;
}

/**
 * @description: 元素拖拽
 * @param {UseDragOptions} opt
 */
export function useDrag(opt: UseDragOptions) {
  const data = {
    currentX: 0,
    currentY: 0,
    flag: false
  };
  const position = opt.initialValue || {
    x: 0,
    y: 0
  };
  const dragEl = unref(opt.dragElRef);
  if (!dragEl) return;
  dragEl.style.position = "absolute";
  dragEl.style.left = `${position.x}px`;
  dragEl.style.top = `${position.y}px`;
  //  鼠标按下时记录鼠标初始位置，打开拖拽
  dragEl.onmousedown = function (e: MouseEvent) {
    data.currentX = e.clientX;
    data.currentY = e.clientY;
    data.flag = true;
  };
  // 鼠标释放时结束拖拽，更新元素位置，关闭拖拽
  dragEl.onmouseup = function () {
    position.x = dragEl.offsetLeft;
    position.y = dragEl.offsetTop;
    data.flag = false;
  };
  // 鼠标移动时，先判断是否开启拖拽
  // 1. 通过当前鼠标的位置减去初始鼠标的位置，得到一个上下偏移量
  // 2. 再用元素的初始位置加上这个偏移量，即为当前元素的位置
  document.onmousemove = function (e: MouseEvent) {
    if (data.flag) {
      const disX = e.clientX - data.currentX,
        disY = e.clientY - data.currentY;
      const left = parseInt(position.x + disX),
        top = parseInt(position.y + disY);
      dragEl.style.left = `${left}px`;
      dragEl.style.top = `${top}px`;
      // 如果传入了外部元素，说明需要限制元素拖拽范围
      // left 控制在 0 到 wrapEl.offsetWidth - el.offsetWidth 之间
      // top 控制在 0 到 wrapEl.offsetHeight - el.offsetHeight 之间
      const wrapEl = unref(opt.wrapElRef);
      if (wrapEl) {
        if (left < 0) {
          dragEl.style.left = `0px`;
        } else if (left > wrapEl.offsetWidth - dragEl.offsetWidth) {
          dragEl.style.left = `${wrapEl.offsetWidth - dragEl.offsetWidth}px`;
        } else {
          dragEl.style.left = `${left}px`;
        }
        if (top < 0) {
          dragEl.style.top = `0px`;
        } else if (top > wrapEl.offsetHeight - dragEl.offsetHeight) {
          dragEl.style.top = `${wrapEl.offsetHeight - dragEl.offsetHeight}px`;
        } else {
          dragEl.style.top = `${top}px`;
        }
      }
      opt.onMove && isFunction(opt.onMove) && opt.onMove(left, top);
      if (e.preventDefault) {
        e.preventDefault();
      }
    }
  };
}
