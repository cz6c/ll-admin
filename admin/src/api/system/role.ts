import { $http } from "@/utils/request";
import type {
  ListRoleDto,
  SysRoleResponse,
  SysRoleListResponse,
  SysRoleData,
  ChangeStatusDto
} from "#/api/system/role";

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
  return $http<never, SysRoleResponse>({
    url: "/system/role/" + roleId,
    method: "get"
  });
}

// 新增角色
export function addRole(data: SysRoleData) {
  return $http<SysRoleData, never>({
    url: "/system/role",
    method: "post",
    data
  });
}

// 修改角色
export function updateRole(data: SysRoleData) {
  return $http<SysRoleData, never>({
    url: "/system/role",
    method: "put",
    data
  });
}

// 角色状态修改
export function changeRoleStatus(data: ChangeStatusDto) {
  return $http<ChangeStatusDto, never>({
    url: "/system/role/changeStatus",
    method: "put",
    data
  });
}

// 删除角色
export function delRole(roleId: number) {
  return $http({
    url: "/system/role/" + roleId,
    method: "delete"
  });
}
