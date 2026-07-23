import service, { errorCode } from "@/utils/request";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { dateUtil } from "@llcz/common";
import $feedback from "@/utils/feedback";

export default {
  // 验证是否为blob格式
  blobValidate(data: { type: string }) {
    return data.type !== "application/json";
  },
  // 获取本地文件临时地址
  getFileLocationUrl(file: File) {
    return window.URL.createObjectURL(file);
  },
  /**
   * @description: 通用下载方法
   * @param {string} url
   * @param {*} data
   * @param {string} filename
   * @param {*} config
   * @return {*}
   */
  async download(url: string, data: any = {}, filename: string, config: any = {}): Promise<void> {
    $feedback.loading("正在下载数据，请稍候");
    try {
      // CzHttp 仅暴露 request；与运行时一致，避免类型声明里虚构的 post
      const res = await service.request(
        {
          url,
          method: "post",
          data,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          responseType: "blob",
          ...config
        },
        config
      );
      const isBlob = this.blobValidate(res);
      if (isBlob) {
        const blob = new Blob([res as unknown as BlobPart]);
        saveAs(blob, filename);
      } else {
        const resText = await (res as any).text();
        const rspObj = JSON.parse(resText);
        const errMsg = errorCode[rspObj.code] || rspObj.msg || errorCode["default"];
        $feedback.message.error(errMsg);
      }
      $feedback.closeLoading();
    } catch (r) {
      console.error(r);
      $feedback.message.error("下载文件出现错误，请联系管理员！");
      $feedback.closeLoading();
    }
  },
  /**
   * @description: 复制图片
   * @param {string} url
   * @return {*}
   */
  async copyImage(url: string): Promise<void> {
    // 剪切板API
    const clipBoardApi = navigator.clipboard;
    if (clipBoardApi) {
      const blob = await fetch(url).then(response => response.blob());
      const clipboardItem = new window.ClipboardItem({
        "image/png": new Blob([blob], { type: "image/png" })
      });
      clipBoardApi
        .write([clipboardItem])
        .then(() => console.log("复制成功"))
        .catch(error => console.log("复制成功", error));
    } else {
      console.error("浏览器不支持navigator.clipboard方法");
    }
  },
  /**
   * @description: 下载图片
   * @param {string} url
   * @return {*}
   */
  async downloadImage(url: string): Promise<void> {
    const blob = await fetch(url).then(response => response.blob());
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = +new Date().getTime() + "";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
  /**
   * @description: 打包图片集合压缩文件
   * @param {string} imgList
   * @param {string} fileName
   * @return {*}
   */
  async downloadPic(imgList: string[], fileName: string): Promise<void> {
    const zip = new JSZip();
    const imgFolder = zip.folder("images");
    for (let i = 0; i < imgList.length; i++) {
      const rowImg = imgList[i];
      const suffix = rowImg.substring(rowImg.lastIndexOf("."));
      const buffer = await fetch(rowImg).then(response => response.arrayBuffer());
      imgFolder.file(i + suffix, buffer);
    }
    zip.generateAsync({ type: "blob" }).then(blob => {
      saveAs(blob, `${fileName}${dateUtil().format("YYYYMMDDHHmmss")}.zip`);
    });
  },
  /**
   * @description: 将网络图片压缩转本地图片
   * @param {*} url
   * @return {*} imgFile
   */
  linkUrlToFile(url: string): Promise<{ base64: string; fileName: string }> {
    const arr = url.split("/");
    const fileName = arr[arr.length - 1];
    const types = fileName.split(".");
    const type = "image/" + types[types.length - 1];
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.src = url + "?" + Date.now();
      img.style.display = "none";
      img.setAttribute("crossOrigin", "Anonymous"); // 支持跨域图片
      img.onload = function () {
        try {
          //默认按比例压缩
          const w = img.width > 1440 ? 1440 : img.width,
            h = img.width > 1440 ? 1440 * (img.height / img.width) : img.height;
          //生成canvas
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          // 创建属性节点
          canvas.setAttribute("width", w + "px");
          canvas.setAttribute("height", h + "px");
          ctx.drawImage(img, 0, 0, w, h);
          const base64 = canvas.toDataURL(type, 0.8);
          resolve({ base64, fileName });
        } catch (error) {
          console.log("🚀 ~ error:", error);
          reject({
            msg: "图片跨域，请联系管理员"
          });
        }
      };
      img.onerror = function () {
        reject({
          msg: "无效图片链接"
        });
      };
    });
  },
  /**
   * @description: 获取excel图片
   * @param {*} file
   * @return {*} imgFiles
   */
  async getExcelImgFile(file: File): Promise<{ base64: string; fileName: string }[]> {
    const imgFiles = []; // 用来存放图片
    const zip = new JSZip(); // 创建jszip实例
    try {
      const zipLoadResult = await zip.loadAsync(file); // 将xlsx文件转zip文件
      for (const key in zipLoadResult["files"]) {
        // 遍历结果中的files对象
        if (key.indexOf("media/image") != -1) {
          const fileName = zipLoadResult["files"][key].name;
          await zip
            .file(fileName)
            .async("base64")
            .then(res => {
              imgFiles.push({
                base64: "data:image/png;base64," + res,
                fileName
              });
            });
        }
      }
    } catch (error) {
      console.log("🚀 ~ getExcelImage ~ error:", error);
    }
    return imgFiles;
  }
};
