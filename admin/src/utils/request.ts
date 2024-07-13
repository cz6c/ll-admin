import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { getToken } from "@/utils/auth";
import { tansParams, blobValidate } from "@/utils";
import { useAuthStore } from "@/store/modules/auth";
import router, { RouterEnum } from "@/router";
import { $message } from "@/utils/message";
import cache from "@/utils/cache";

const errorCode = {
  "401": "认证失败，无法访问系统资源",
  "403": "当前操作没有权限",
  "404": "访问资源不存在",
  default: "系统未知错误，请反馈给管理员",
};

// 封装axios
const service = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL,
  withCredentials: false, // 设置跨域cookie上传
  timeout: 10000, // 请求超时
});

// request 拦截器 ==> 对请求参数做处理
service.interceptors.request.use(
  config => {
    // 判断为文件流
    const isFileApi = config.params && config.params.isExportApi;
    if (isFileApi) {
      config.responseType = "blob";
    }
    config.headers.Authorization = config.headers.Authorization || `Bearer ${getToken()}`;
    // get请求映射params参数
    if (config.method === "get" && config.params) {
      let url = config.url + "?" + tansParams(config.params);
      url = url.slice(0, -1);
      config.params = {};
      config.url = url;
    }
    // 是否需要防止数据重复提交 默认false 处理
    const isRepeatSubmit = config.headers?.repeatSubmit;
    if (!isRepeatSubmit && (config.method === "post" || config.method === "put")) {
      const requestObj = {
        url: config.url,
        data: typeof config.data === "object" ? JSON.stringify(config.data) : config.data,
        time: new Date().getTime(),
      };
      const sessionObj = cache.session.getJSON("sessionObj");
      if (sessionObj === undefined || sessionObj === null || sessionObj === "") {
        cache.session.setJSON("sessionObj", requestObj);
      } else {
        const s_url = sessionObj.url; // 请求地址
        const s_data = sessionObj.data; // 请求数据
        const s_time = sessionObj.time; // 请求时间
        const interval = 1000; // 间隔时间(ms)，小于此时间视为重复提交
        if (s_data === requestObj.data && requestObj.time - s_time < interval && s_url === requestObj.url) {
          const message = "数据正在处理，请勿重复提交";
          console.warn(`[${s_url}]: ` + message);
          return Promise.reject(new Error(message));
        } else {
          cache.session.setJSON("sessionObj", requestObj);
        }
      }
    }
    return config;
  },
  error => {
    console.log(error); // for debug
    return Promise.reject(error);
  },
);
// response 拦截器 ==> 对响应做处理
service.interceptors.response.use(
  response => {
    const res = response.data;
    // 判断为文件流
    const isFileApi = response.config.params && response.config.params.isExportApi;
    if (isFileApi) {
      return response;
    }
    // 未设置状态码则默认成功状态
    const code = res.code || 200;
    // 获取错误信息
    const msg = errorCode[code] || res.msg || errorCode["default"];
    // 二进制数据则直接返回
    if (response.request.responseType === "blob" || response.request.responseType === "arraybuffer") {
      return res;
    }
    // 当请求不为200时，报错
    if (res.code !== 200) {
      if (res.code === 401) {
        // 登录过期或权限变更处理
        const { webLogout } = useAuthStore();
        webLogout();
        router.replace(RouterEnum.BASE_LOGIN_PATH);
      }
      $message.error(msg);
      return Promise.reject(new Error(msg || "Error"));
    } else {
      return res;
    }
  },
  error => {
    const err = error.response;
    if (err.status === 401) {
      // 登录过期或权限变更处理
      const { webLogout } = useAuthStore();
      webLogout();
      router.replace(RouterEnum.BASE_LOGIN_PATH);
      $message.error("登录超时");
      return;
    }
    const message = err.data ? err.data.message : err.statusText;
    $message.error(message);
    console.log("err" + message); // for debug
    return Promise.reject(new Error(message || "Error"));
  },
);
export default service;

// 封装 get post 方法
interface Response<T> {
  code: number; // 状态码
  msg: string; // 接口消息
  data: T;
}
export const createGet = <P extends Record<string, any>, R>(url: string, config: AxiosRequestConfig = {}) => {
  return (params?: P): Promise<Response<R>> => {
    return service.request({
      method: "get",
      url,
      params,
      ...config,
    });
  };
};
export const createPost = <P extends Record<string, any>, R>(url: string, config: AxiosRequestConfig = {}) => {
  return (data?: P): Promise<Response<R>> => {
    return service.request({
      method: "post",
      url,
      data,
      ...config,
    });
  };
};
