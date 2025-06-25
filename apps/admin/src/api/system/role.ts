import { $http } from "@/utils/request";
import type { ListRoleDto, SysRoleListResponse, ChangeStatusDto, UpdateRoleDto, SysRoleVo } from "#/api/system/role";

// 查询角色列表
export function listRole(params: ListRoleDto) {
  return $http<never, SysRoleListResponse>({
    url: "/system/role/list",
    method: "get",
    params
  });
}

// 查询角色详细
export function getRole(roleId: number) {
  return $http<never, SysRoleVo>({
    url: "/system/role/" + roleId,
    method: "get"
  });
}

// 新增角色
export function addRole(data: UpdateRoleDto) {
  return $http<UpdateRoleDto, never>({
    url: "/system/role/create",
    method: "post",
    data
  });
}

// 修改角色
export function updateRole(data: UpdateRoleDto) {
  return $http<UpdateRoleDto, never>({
    url: "/system/role/update",
    method: "post",
    data
  });
}

// 角色状态修改
export function changeRoleStatus(data: ChangeStatusDto) {
  return $http<ChangeStatusDto, never>({
    url: "/system/role/changeStatus",
    method: "post",
    data
  });
}

// 删除角色
export function delRole(roleIds: string) {
  return $http({
    url: "/system/role/delete/" + roleIds,
    method: "get"
  });
}
