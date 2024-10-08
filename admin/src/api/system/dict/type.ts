import { $http } from "@/utils/request";
import type { ListDictTypeDto, SysDictTypeData, SysDictTypeListResponse, SysDictTypeResponse } from "#/api/system/dict";

// 查询字典类型列表
export function listType(params: ListDictTypeDto) {
  return $http<never, SysDictTypeListResponse>({
    url: "/system/dict/type/list",
    method: "get",
    params
  });
}

// 查询字典类型详细
export function getType(dictId: number) {
  return $http<never, SysDictTypeResponse>({
    url: "/system/dict/type/" + dictId,
    method: "get"
  });
}

// 新增字典类型
export function addType(data: SysDictTypeData) {
  return $http<SysDictTypeData, never>({
    url: "/system/dict/type",
    method: "post",
    data
  });
}

// 修改字典类型
export function updateType(data: SysDictTypeData) {
  return $http<SysDictTypeData, never>({
    url: "/system/dict/type",
    method: "put",
    data: data
  });
}

// 删除字典类型
export function delType(dictIds: string) {
  return $http<SysDictTypeData, never>({
    url: "/system/dict/type/" + dictIds,
    method: "delete"
  });
}

// 刷新字典缓存
export function refreshCache() {
  return $http({
    url: "/system/dict/type/refreshCache",
    method: "delete"
  });
}

// 获取字典选择框列表
export function optionselect() {
  return $http<never, SysDictTypeResponse[]>({
    url: "/system/dict/type/optionselect",
    method: "get"
  });
}
