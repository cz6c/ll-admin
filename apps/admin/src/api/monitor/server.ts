import $http from "@/utils/request";

// 获取服务信息
export function getServer() {
  return $http.request({
    url: "/monitor/server",
    method: "get"
  });
}
