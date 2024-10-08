import { $http } from "@/utils/request";
import type { ListDictDto, SysDictData, SysDictListResponse, SysDictResponse } from "#/api/system/dict";

// 查询字典数据列表
export function listData(params: ListDictDto) {
  return $http<never, SysDictListResponse>({
    url: "/system/dict/data/list",
    method: "get",
    params
  });
}

// 查询字典数据详细
export function getData(dictCode: number) {
  return $http<never, SysDictResponse>({
    url: "/system/dict/data/" + dictCode,
    method: "get"
  });
}

// 根据字典类型查询字典数据信息
export function getDicts(dictType: string) {
  return $http<never, SysDictResponse[]>({
    url: "/system/dict/data/type/" + dictType,
    method: "get"
  });
}

// 新增字典数据
export function addData(data: SysDictData) {
  return $http<SysDictData, never>({
    url: "/system/dict/data",
    method: "post",
    data
  });
}

// 修改字典数据
export function updateData(data: SysDictData) {
  return $http<SysDictData, never>({
    url: "/system/dict/data",
    method: "put",
    data
  });
}

// 删除字典数据
export function delData(dictCode: number) {
  return $http({
    url: "/system/dict/data/" + dictCode,
    method: "delete"
  });
}
