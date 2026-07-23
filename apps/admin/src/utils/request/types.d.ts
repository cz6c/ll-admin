import type { AxiosError, AxiosResponse, AxiosRequestConfig } from "axios";

/** 后端统一响应壳；与 index.ts 拦截器成功分支返回的 res 一致 */
export interface CzHttpApiResponse<R = any> {
  code: number;
  msg: string;
  data: R;
}

export interface CzHttpError extends AxiosError {
  isCancelRequest?: boolean;
}

/** 对齐 axios 三泛参 AxiosResponse；config 收窄为带回调的 CzHttpRequestConfig */
export interface CzHttpResponse<T = any, D = any> extends AxiosResponse<T, D, any> {
  config: CzHttpRequestConfig;
}

export interface CzHttpRequestConfig extends AxiosRequestConfig {
  beforeRequestCallback?: (request: CzHttpRequestConfig) => void;
  beforeResponseCallback?: (response: CzHttpResponse) => void;
}

/** 与 index.ts 运行时 CzHttp 一致：仅暴露 request(config, axiosConfig?) */
export default class CzHttp {
  request<Q extends Record<string, any>, R>(config: AxiosRequestConfig<Q>, axiosConfig?: CzHttpRequestConfig): Promise<CzHttpApiResponse<R>>;
}
