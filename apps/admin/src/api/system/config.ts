import $http from "@/utils/request";
import type { ListConfigDto, UpdateConfigDto, SysConfigListResponse, SysConfigVo } from "#/api/system/config";

// 查询参数列表
export function listConfig(params: ListConfigDto) {
  return $http.request<never, SysConfigListResponse>({
    url: "/system/config/list",
    method: "get",
    params
  });
}

// 查询参数详细
export function getConfig(configId: number) {
  return $http.request<never, SysConfigVo>({
    url: "/system/config/" + configId,
    method: "get"
  });
}

// 新增参数配置
export function addConfig(data: UpdateConfigDto) {
  return $http.request<UpdateConfigDto, never>({
    url: "/system/config/create",
    method: "post",
    data
  });
}

// 修改参数配置
export function updateConfig(data: UpdateConfigDto) {
  return $http.request<UpdateConfigDto, never>({
    url: "/system/config/update",
    method: "post",
    data
  });
}

// 删除参数配置
export function delConfig(configIds: string) {
  return $http.request({
    url: "/system/config/delete/" + configIds,
    method: "get"
  });
}
