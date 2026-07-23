import type { ElMessageBoxOptions, MessageOptions } from "element-plus";

/** ElLoading.service 返回实例；避免依赖 element-plus 内部 .d.ts 深路径（升级后易断） */
type LoadingInstance = ReturnType<typeof ElLoading.service>;

let loadingInstance: LoadingInstance;

function handleMessage(type: MessageOptions["type"], customClass: MessageOptions["customClass"]) {
  return function (message: MessageOptions["message"], params?: MessageOptions) {
    return ElMessage({ ...params, type, message, customClass });
  };
}

export default {
  confirm(content: ElMessageBoxOptions["message"]) {
    return ElMessageBox.confirm(content, "系统提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning"
    });
  },
  // 打开遮罩层
  loading(content: any) {
    loadingInstance = ElLoading.service({
      lock: true,
      text: content,
      background: "rgba(0, 0, 0, 0.7)"
    });
  },
  // 关闭遮罩层
  closeLoading() {
    loadingInstance.close();
  },
  /**
   * `Message` 处理消息函数
   */
  message: {
    success: handleMessage("success", "diy-message"),
    info: handleMessage("info", "diy-message"),
    warning: handleMessage("warning", "diy-message"),
    error: handleMessage("error", "diy-message"),
    closeAll: ElMessage.closeAll
  }
};
