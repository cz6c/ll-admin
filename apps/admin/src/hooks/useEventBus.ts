import type { Emitter } from "mitt";
import mitt from "mitt";

/** 全局公共事件需要在此处添加类型 */
type Events = {
  openPanel: string;
  tagOnClick: string;
  logoChange: boolean;
  tagViewsChange: string;
  changLayoutRoute: string;
  tagViewsShowModel: string;
  showProductDetailDrawer: string;
};

export const emitter: Emitter<Events> = mitt<Events>();

/**
 * @description: 发送事件
 * @param {Key} eventKey
 * @param {Events} val
 */
export function eventBusEmit<Key extends keyof Events>(eventKey: Key, val: Events[Key]) {
  return emitter.emit(eventKey, val);
}

/**
 * @description: 注册事件（自动销毁）
 * @param {Key} eventKey
 * @param {Fn} callback
 */
export function useEventBus<Key extends keyof Events>(eventKey: Key, callback: Fn) {
  onMounted(() => {
    emitter.on(eventKey, callback);
  });

  // 在组件卸载时移除监听器
  onBeforeUnmount(() => {
    emitter.off(eventKey, callback);
  });
}
