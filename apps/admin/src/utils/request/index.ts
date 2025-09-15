import Axios, { type AxiosInstance, type AxiosRequestConfig, type CustomParamsSerializer } from "axios";
import type { CzHttpError, CzHttpResponse, CzHttpRequestConfig } from "./types.d";
import { stringify } from "qs";
import { getToken, formatToken } from "@/utils/auth";
import { useAuthStore } from "@/store/modules/auth";
import { WebStorage } from "../storage";
import $feedback from "@/utils/feedback";

interface Response<T> {
  code: number; // 状态码
  msg: string; // 接口消息
  data: T;
}

export const errorCode = {
  "403": "当前操作没有权限",
  "404": "访问资源不存在",
  default: "系统未知错误，请反馈给管理员"
};

// 相关配置请参考：www.axios-js.com/zh-cn/docs/#axios-request-config-1
const defaultConfig: AxiosRequestConfig = {
  baseURL: import.meta.env.VITE_BASE_URL,
  withCredentials: false, // 设置跨域cookie上传
  timeout: 10000, // 请求超时
  // 数组格式参数序列化（https://github.com/axios/axios/issues/5142）
  paramsSerializer: {
    serialize: stringify as unknown as CustomParamsSerializer
  }
};

class CzHttp {
  constructor() {
    this.httpInterceptorsRequest();
    this.httpInterceptorsResponse();
  }

  /** `token`过期后，暂存待执行的请求 */
  private static requests = [];

  /** 防止重复刷新`token` */
  private static isRefreshing = false;

  /** 初始化配置对象 */
  private static initConfig: CzHttpRequestConfig = {};

  /** 保存当前`Axios`实例对象 */
  private static axiosInstance: AxiosInstance = Axios.create(defaultConfig);

  /** 重连原始请求 */
  private static retryOriginalRequest(config: CzHttpRequestConfig) {
    return new Promise(resolve => {
      CzHttp.requests.push((token: string) => {
        config.headers["Authorization"] = formatToken(token);
        resolve(CzHttp.axiosInstance(config));
      });
    });
  }

  /** 请求拦截 */
  private httpInterceptorsRequest(): void {
    CzHttp.axiosInstance.interceptors.request.use(
      async (config: CzHttpRequestConfig): Promise<any> => {
        // 优先判断post/get等方法是否传入回调，否则执行初始化设置等回调
        if (typeof config.beforeRequestCallback === "function") {
          config.beforeRequestCallback(config);
          return config;
        }
        if (CzHttp.initConfig.beforeRequestCallback) {
          CzHttp.initConfig.beforeRequestCallback(config);
          return config;
        }
        // 是否需要防止数据重复提交 默认false 处理
        const isRepeatSubmit = config.headers?.repeatSubmit;
        if (!isRepeatSubmit && config.method === "post") {
          const requestObj = {
            url: config.url,
            data: typeof config.data === "object" ? JSON.stringify(config.data) : config.data,
            time: new Date().getTime()
          };
          const cache = new WebStorage("sessionStorage");
          const sessionObj = cache.getItem("sessionObj");
          if (sessionObj === undefined || sessionObj === null || sessionObj === "") {
            cache.setItem("sessionObj", requestObj);
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
              cache.setItem("sessionObj", requestObj);
            }
          }
        }
        /** 请求白名单，放置一些不需要`token`的接口（通过设置请求白名单，防止`token`过期后再请求造成的死循环问题） */
        const whiteList = ["/refreshToken", "/login"];
        return whiteList.some(url => config.url.endsWith(url))
          ? config
          : new Promise(resolve => {
              const data = getToken();
              if (data) {
                config.headers["Authorization"] = formatToken(data.token);
                resolve(config);
              } else {
                resolve(config);
              }
            });
      },
      error => {
        return Promise.reject(error);
      }
    );
  }

  /** 响应拦截 */
  private httpInterceptorsResponse(): void {
    const instance = CzHttp.axiosInstance;
    instance.interceptors.response.use(
      async (response: CzHttpResponse) => {
        const $config = response.config;
        // 优先判断post/get等方法是否传入回调，否则执行初始化设置等回调
        if (typeof $config.beforeResponseCallback === "function") {
          $config.beforeResponseCallback(response);
          return response.data;
        }
        if (CzHttp.initConfig.beforeResponseCallback) {
          CzHttp.initConfig.beforeResponseCallback(response);
          return response.data;
        }
        const res = response.data;
        // 二进制数据则直接返回
        if (response.request.responseType === "blob" || response.request.responseType === "arraybuffer") {
          return res;
        }
        // 未设置状态码则默认成功状态
        const code = res.code || 200;
        // 获取错误信息
        const msg = errorCode[code] || res.msg || errorCode["default"];
        // 当请求不为200时，报错
        if (res.code !== 200) {
          if (res.code === 401) {
            // 登录过期或权限变更处理
            if (!CzHttp.isRefreshing) {
              CzHttp.isRefreshing = true;
              const data = getToken();
              // token过期刷新
              useAuthStore()
                .handRefreshToken({ refreshToken: data?.token })
                .then(res => {
                  const { token } = res;
                  $config.headers["Authorization"] = formatToken(token);
                  CzHttp.requests.forEach(cb => cb(token));
                })
                .finally(() => {
                  CzHttp.requests = [];
                  CzHttp.isRefreshing = false;
                });
            }
            return CzHttp.retryOriginalRequest($config);
          } else {
            $feedback.message.error(msg);
            return Promise.reject(new Error(msg || "Error"));
          }
        } else {
          return res;
        }
      },
      (error: CzHttpError) => {
        const $error = error;
        $error.isCancelRequest = Axios.isCancel($error);
        // 所有的响应异常 区分来源为取消请求/非取消请求
        return Promise.reject($error);
      }
    );
  }

  /** 通用请求工具函数 */
  public request<Q extends Record<string, any>, R>(config: AxiosRequestConfig<Q>, axiosConfig?: CzHttpRequestConfig): Promise<Response<R>> {
    return CzHttp.axiosInstance.request({
      ...config,
      ...axiosConfig
    });
  }
}

const $http = new CzHttp();

// 适配 openapi2ts
export function request<T = unknown>(url: string, options: AxiosRequestConfig) {
  return $http.request<Record<string, any>, T>({
    url,
    ...options
  });
}

export default $http;
