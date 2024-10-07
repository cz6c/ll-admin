import { $http } from "@/utils/request";
import type { OnlineListParams, OnlineListResponse } from "#/api/monitor/online";

// 查询在线用户列表
export function list(params: OnlineListParams) {
  return $http<never, OnlineListResponse>({
    url: "/monitor/online/list",
    method: "get",
    params
  });
}

// 强退用户
export function forceLogout(tokenId: string) {
  return $http({
    url: "/monitor/online/" + tokenId,
    method: "delete"
  });
}
