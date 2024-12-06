import { $http } from "@/utils/request";
import type { ListDeptDto, SysDeptData, SysDeptListResponse, SysDeptResponse } from "#/api/system/dept";

// 查询部门列表
export function listDept(params?: ListDeptDto) {
  return $http<never, SysDeptListResponse>({
    url: "/system/dept/list",
    method: "get",
    params
  });
}

// 查询部门列表（排除节点）
export function listDeptExcludeChild(deptId: number) {
  return $http<never, SysDeptListResponse>({
    url: "/system/dept/list/exclude/" + deptId,
    method: "get"
  });
}

// 查询部门下拉树结构
export function treeSelect() {
  return $http<never, SysDeptListResponse>({
    url: `/system/dept/treeSelect`,
    method: "get"
  });
}

// 根据角色ID查询部门树结构
export function roleDeptTreeSelect(roleId: number) {
  return $http<never, { depts: SysDeptResponse[]; checkedKeys: number[] }>({
    url: "/system/dept/roleDeptTreeSelect/" + roleId,
    method: "get"
  });
}

// 查询部门详细
export function getDept(deptId: number) {
  return $http<never, SysDeptResponse>({
    url: "/system/dept/" + deptId,
    method: "get"
  });
}

// 新增部门
export function addDept(data: SysDeptData) {
  return $http<SysDeptData, never>({
    url: "/system/dept",
    method: "post",
    data
  });
}

// 修改部门
export function updateDept(data: SysDeptData) {
  return $http<SysDeptData, never>({
    url: "/system/dept",
    method: "put",
    data
  });
}

// 删除部门
export function delDept(deptId: number) {
  return $http({
    url: "/system/dept/" + deptId,
    method: "delete"
  });
}
