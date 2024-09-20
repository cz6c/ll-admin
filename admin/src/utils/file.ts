import service, { errorCode } from "@/utils/request";
import { saveAs } from "file-saver";
import $message from "@/utils/message";
import $modal from "@/utils/modal";

export default {
  // 验证是否为blob格式
  blobValidate(data) {
    return data.type !== "application/json";
  },
  // 通用下载方法
  async download(url: string, data = {}, filename: string, config = {}) {
    $modal.loading("正在下载数据，请稍候");
    try {
      const res = await service.post(url, data, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        responseType: "blob",
        ...config
      });
      const isBlob = this.blobValidate(res);
      if (isBlob) {
        const blob = new Blob([res as unknown as BlobPart]);
        saveAs(blob, filename);
      } else {
        const resText = await (res as any).text();
        const rspObj = JSON.parse(resText);
        const errMsg = errorCode[rspObj.code] || rspObj.msg || errorCode["default"];
        $message.error(errMsg);
      }
      $modal.closeLoading();
    } catch (r) {
      console.error(r);
      $message.error("下载文件出现错误，请联系管理员！");
      $modal.closeLoading();
    }
  }
};
