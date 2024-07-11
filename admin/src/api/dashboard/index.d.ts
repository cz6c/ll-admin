import { GetListParams, GetListResponse } from "@/api/public/index.d";
// 登录日志
export interface LoginLogInfo {
  country: string; //  ip下的城市信息
  id: string; // id
  ip: string; // ip地址
  createTime: number; // 登录时间
  name: string; // 浏览器名称
  platform: string; // 操作系统
  userId: string; // 所属用户ID
  userName: string; // 账号
  useragent: string; // 浏览器agent信息
}
export type ResponseLoginLogList = GetListResponse<LoginLogInfo>;
export interface ParamsLoginLogList extends GetListParams {
  createTime?: number;
}
