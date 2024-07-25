import { ElMessageBox, ElLoading, type ElMessageBoxOptions } from "element-plus";
import type { LoadingInstance } from "element-plus/es/components/loading/src/loading.d.ts";
import { $message, type MessageParams } from "@/utils/message";

let loadingInstance: LoadingInstance;

export default {
  // 消息提示
  msg(content: string | VNode | (() => VNode), params: MessageParams) {
    return $message.info(content, params);
  },
  // 错误消息
  msgError(content: string | VNode | (() => VNode), params: MessageParams) {
    return $message.error(content, params);
  },
  // 成功消息
  msgSuccess(content: string | VNode | (() => VNode), params: MessageParams) {
    return $message.success(content, params);
  },
  // 警告消息
  msgWarning(content: string | VNode | (() => VNode), params: MessageParams) {
    return $message.warning(content, params);
  },
  // 确认窗体
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
  }
};
