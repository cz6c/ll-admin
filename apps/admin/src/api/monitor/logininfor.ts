import { $http } from "@/utils/request";
import type { LoginlogListParams, LoginlogListResponse } from "#/api/monitor/logininfor";

// 查询登录日志列表
export function listLogininfor(params: LoginlogListParams) {
  return $http<never, LoginlogListResponse>({
    url: "/monitor/logininfor/list",
    method: "get",
    params
  });
}
