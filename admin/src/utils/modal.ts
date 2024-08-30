import type { ElMessageBoxOptions } from "element-plus";
import type { LoadingInstance } from "element-plus/es/components/loading/src/loading.d.ts";

let loadingInstance: LoadingInstance;

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
  }
};
