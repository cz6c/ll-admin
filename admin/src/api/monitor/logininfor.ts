import { $http } from "@/utils/request";
import type { LoginlogListParams, LoginlogListResponse } from "#/api/monitor/logininfor";

// 查询登录日志列表
export function list(params: LoginlogListParams) {
  return $http<never, LoginlogListResponse>({
    url: "/monitor/logininfor/list",
    method: "get",
    params
  });
}

// 删除登录日志
export function delLogininfor(infoId: number) {
  return $http({
    url: "/monitor/logininfor/" + infoId,
    method: "delete"
  });
}

// 解锁用户登录状态
export function unlockLogininfor(userName: string) {
  return $http({
    url: "/monitor/logininfor/unlock/" + userName,
    method: "get"
  });
}

// 清空登录日志
export function cleanLogininfor() {
  return $http({
    url: "/monitor/logininfor/clean",
    method: "delete"
  });
}
