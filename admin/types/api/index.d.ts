// 列表请求
export interface GetListParams {
  page: number;
  limit: number;
}
// 列表响应
export interface GetListResponse<T> {
  list: Array<T>;
  total: number;
}

// 登录参数
export interface LoginParams {
  username: string;
  password: string;
  code: string;
  uuid: string;
}
