import { $http } from "@/utils/request";
import type { ListDeptDto, UpdateDeptDto, SysDeptVo, DeptTreeVo, RoleDeptTreeSelectVo } from "#/api/system/dept";

// 查询部门树结构
export function deptTreeSelect(params?: ListDeptDto) {
  return $http<never, DeptTreeVo[]>({
    url: `/system/dept/treeSelect`,
    method: "get",
    params
  });
}

// 根据角色ID查询部门树结构
export function roleDeptTreeSelect(roleId: number) {
  return $http<never, RoleDeptTreeSelectVo>({
    url: "/system/dept/roleDeptTreeSelect/" + roleId,
    method: "get"
  });
}

// 查询部门详细
export function getDept(deptId: number) {
  return $http<never, SysDeptVo>({
    url: "/system/dept/" + deptId,
    method: "get"
  });
}

// 新增部门
export function addDept(data: UpdateDeptDto) {
  return $http<UpdateDeptDto, never>({
    url: "/system/dept/create",
    method: "post",
    data
  });
}

// 修改部门
export function updateDept(data: UpdateDeptDto) {
  return $http<UpdateDeptDto, never>({
    url: "/system/dept/update",
    method: "post",
    data
  });
}

// 删除部门
export function delDept(deptId: number) {
  return $http({
    url: "/system/dept/delete/" + deptId,
    method: "get"
  });
}
