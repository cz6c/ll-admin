import * as qiniu from "qiniu-js";
import { Config, Extra } from "qiniu-js/esm/upload";
import { getQiniuToken } from "@/api/public";

/**
 * @description: 上传七牛云
 * @param {File} file File 对象，上传的文件
 * @return {*}
 */
export function qiniuUpload(file: File): Promise<string> {
  return new Promise(async (resolve, reject) => {
    // 获取上传信息
    const {
      data: { token, key, domain },
    } = await getQiniuToken();
    // 上传任务的配置信息
    const config: Config = {
      useCdnDomain: true,
      region: qiniu.region.z2,
    };
    // 上传文件的资源信息配置
    const putExtra: Extra = {
      fname: file.name,
    };

    const observable = qiniu.upload(file, key, token, putExtra, config);
    // 上传
    observable.subscribe({
      next({ total }) {
        console.log(total);
      },
      error({ message }) {
        reject(message ?? "上传失败");
      },
      // 接收上传完成后的后端返回信息，具体返回结构取决于后端 SDK 的配置
      complete(res) {
        console.log(res);
        // 地址
        const url = `${domain}${res.key}`;
        resolve(url);
      },
    });
  });
}
