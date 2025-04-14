import mitt from "mitt";
const emitter = mitt();

const eventKeySet = new Set(["testBus"]);

/**
 * @description: 发送事件
 * @param {string} eventKey
 * @param {Record} val
 */
export function eventBusEmit(eventKey: string, val: Record<string, any>) {
  if (eventKeySet.has(eventKey)) {
    return emitter.emit(eventKey, val);
  } else {
    console.warn(`$emit，${eventKey}不存在，请先定义`);
  }
}

/**
 * @description: 注册事件（自动销毁）
 * @param {string} eventKey
 * @param {Fn} callback
 */
export function useEventBus(eventKey: string, callback: Fn) {
  // 监听事件
  if (eventKeySet.has(eventKey)) {
    emitter.on(eventKey, callback);
  } else {
    console.warn(`$on，${eventKey}不存在，请先定义`);
  }

  // 在组件卸载时移除监听器
  onUnmounted(() => {
    if (eventKeySet.has(eventKey)) {
      emitter.off(eventKey, callback);
    } else {
      console.warn(`$on，${eventKey}不存在，请先定义`);
    }
  });
}
