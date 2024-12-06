import { $http } from "@/utils/request";
import type {
  ListRoleDto,
  SysRoleResponse,
  SysRoleListResponse,
  SysRoleData,
  ChangeStatusDto,
  AuthUserCancelAllDto,
  AuthUserSelectAllDto,
  AuthUserCancelDto
} from "#/api/system/role";
import type { AllocatedListDto, SysUserListResponse } from "#/api/system/user";

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

// 查询角色已授权用户列表
export function allocatedUserList(params: AllocatedListDto) {
  return $http<never, SysUserListResponse>({
    url: "/system/role/authUser/allocatedList",
    method: "get",
    params
  });
}

// 查询角色未授权用户列表
export function unallocatedUserList(params: AllocatedListDto) {
  return $http<never, SysUserListResponse>({
    url: "/system/role/authUser/unallocatedList",
    method: "get",
    params
  });
}

// 取消用户授权角色
export function authUserCancel(data: AuthUserCancelDto) {
  return $http<AuthUserCancelDto, never>({
    url: "/system/role/authUser/cancel",
    method: "put",
    data
  });
}

// 批量取消用户授权角色
export function authUserCancelAll(data: AuthUserCancelAllDto) {
  return $http<AuthUserCancelAllDto, never>({
    url: "/system/role/authUser/cancelAll",
    method: "put",
    data
  });
}

// 授权用户选择
export function authUserSelectAll(data: AuthUserSelectAllDto) {
  return $http<AuthUserSelectAllDto, never>({
    url: "/system/role/authUser/selectAll",
    method: "put",
    data
  });
}
