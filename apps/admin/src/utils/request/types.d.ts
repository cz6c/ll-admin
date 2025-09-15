import type {
  Method,
  AxiosError,
  AxiosResponse,
  AxiosRequestConfig
} from "axios";

export type resultType = {
  accessToken?: string;
};

export type RequestMethods = Extract<
  Method,
  "get" | "post" | "put" | "delete" | "patch" | "option" | "head"
>;

export interface CzHttpError extends AxiosError {
  isCancelRequest?: boolean;
}

export interface CzHttpResponse extends AxiosResponse {
  config: CzHttpRequestConfig;
}

export interface CzHttpRequestConfig extends AxiosRequestConfig {
  beforeRequestCallback?: (request: CzHttpRequestConfig) => void;
  beforeResponseCallback?: (response: CzHttpResponse) => void;
}

export default class CzHttp {
  request<T>(
    method: RequestMethods,
    url: string,
    param?: AxiosRequestConfig,
    axiosConfig?: CzHttpRequestConfig
  ): Promise<T>;
  post<T, P>(
    url: string,
    params?: P,
    config?: CzHttpRequestConfig
  ): Promise<T>;
  get<T, P>(
    url: string,
    params?: P,
    config?: CzHttpRequestConfig
  ): Promise<T>;
}
