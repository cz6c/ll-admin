import type { MessageOptions } from "element-plus";

/**
 * `Message` 处理消息函数
 */
function handleMessage(type: MessageOptions["type"], customClass: MessageOptions["customClass"]) {
  return function (message: MessageOptions["message"], params?: MessageOptions) {
    return ElMessage({ ...params, type, message, customClass });
  };
}

export default {
  success: handleMessage("success", "diy-message"),
  info: handleMessage("info", "diy-message"),
  warning: handleMessage("warning", "diy-message"),
  error: handleMessage("error", "diy-message"),
  closeAll: ElMessage.closeAll
};
