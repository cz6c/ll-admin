import { $http } from "@/utils/request";
import type { ListConfigDto, SysConfigData, SysConfigListResponse, SysConfigResponse } from "#/api/system/config";

// 查询参数列表
export function listConfig(params: ListConfigDto) {
  return $http<never, SysConfigListResponse>({
    url: "/system/config/list",
    method: "get",
    params
  });
}

// 查询参数详细
export function getConfig(configId: number) {
  return $http<never, SysConfigResponse>({
    url: "/system/config/" + configId,
    method: "get"
  });
}

// 新增参数配置
export function addConfig(data: SysConfigData) {
  return $http<SysConfigData, never>({
    url: "/system/config",
    method: "post",
    data
  });
}

// 修改参数配置
export function updateConfig(data: SysConfigData) {
  return $http<SysConfigData, never>({
    url: "/system/config",
    method: "put",
    data
  });
}

// 删除参数配置
export function delConfig(configIds: string) {
  return $http({
    url: "/system/config/" + configIds,
    method: "delete"
  });
}
