import { $http } from "@/utils/request";

// 查询操作日志列表
export function list(query) {
  return $http({
    url: "/monitor/operlog/list",
    method: "get",
    params: query
  });
}

// 删除操作日志
export function delOperlog(operId) {
  return $http({
    url: "/monitor/operlog/" + operId,
    method: "delete"
  });
}
