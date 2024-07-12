import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import { getToken } from "@/utils/auth";
import { useAuthStore } from "@/store/modules/auth";
import router, { RouterEnum } from "@/router";
import { $message } from "@/utils/message";

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
    // 判断为文件流
    const isFileApi = response.config.params && response.config.params.isExportApi;
    if (isFileApi) {
      return response;
    }
    const res = response.data;
    // 当请求不为200时，报错
    if (res.code !== 200) {
      $message.error(res.message);
      return Promise.reject(new Error(res.message || "Error"));
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
  message: string; // 接口消息
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
