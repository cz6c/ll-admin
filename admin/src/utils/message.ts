import { VNode } from "vue";
import { MessageHandler, ElMessage } from "element-plus";

type messageTypes = "info" | "success" | "warning" | "error";

export interface MessageParams {
  /** 自定义图标，该属性会覆盖 `type` 的图标 */
  icon?: any;
  /** 是否将 `message` 属性作为 `HTML` 片段处理，默认 `false` */
  dangerouslyUseHTMLString?: boolean;
  /** 显示时间，单位为毫秒。设为 `0` 则不会自动关闭，`element-plus` 默认是 `3000` ，平台改成默认 `2000` */
  duration?: number;
  /** 是否显示关闭按钮，默认值 `false` */
  showClose?: boolean;
  /** 文字是否居中，默认值 `false` */
  center?: boolean;
  /** `Message` 距离窗口顶部的偏移量，默认 `20` */
  offset?: number;
  /** 设置组件的根元素，默认 `document.body` */
  appendTo?: string | HTMLElement;
  /** 合并内容相同的消息，不支持 `VNode` 类型的消息，默认值 `false` */
  grouping?: boolean;
  /** 关闭时的回调函数, 参数为被关闭的 `message` 实例 */
  onClose?: (() => void) | undefined;
}

/**
 * `Message` 处理消息函数
 */
function handleMessage(type: messageTypes, customClass: string) {
  return function (message: string | VNode | (() => VNode), params?: MessageParams): MessageHandler {
    return ElMessage({
      type,
      message,
      customClass,
      ...params,
    });
  };
}

export const $message = {
  success: handleMessage("success", "diy-message"),
  info: handleMessage("info", "diy-message"),
  warning: handleMessage("warning", "diy-message"),
  error: handleMessage("error", "diy-message"),
  closeAll: ElMessage.closeAll,
};
