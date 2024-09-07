import { $http } from "@/utils/request";
import type {
  SysUserData,
  SysUserResponse,
  SysUserListParams,
  SysUserListResponse,
  ResetPwdDto,
  ChangeStatusDto,
  RequestUserPayload,
  UpdateProfileDto,
  UpdatePwdDto,
  SysPostAndPostResponse
} from "#/api/system/user";
import type { SysRoleResponse } from "#/api/system/role";

// 查询用户列表
export function listUser(params: SysUserListParams) {
  return $http<never, SysUserListResponse>({
    url: `/system/user/list`,
    method: "get",
    params
  });
}

// 查询用户详细
export function getUser(userId: number) {
  return $http<never, SysUserResponse>({
    url: `/system/user/${userId}`,
    method: "get"
  });
}

// 查询用户详细
export function getPostAndRoleAll() {
  return $http<never, SysPostAndPostResponse>({
    url: `/system/user/getPostAndRoleAll`,
    method: "get"
  });
}

// 新增用户
export function addUser(data: SysUserData) {
  return $http<SysUserData, never>({
    url: `/system/user`,
    method: "post",
    data
  });
}

// 修改用户
export function updateUser(data: SysUserData) {
  return $http<SysUserData, never>({
    url: `/system/user`,
    method: "put",
    data
  });
}

// 删除用户
export function delUser(userIds: string) {
  return $http<never, SysUserResponse>({
    url: `/system/user/${userIds}`,
    method: "delete"
  });
}

// 用户密码重置
export function resetUserPwd(data: ResetPwdDto) {
  return $http<ResetPwdDto, never>({
    url: `/system/user/resetPwd`,
    method: "put",
    data
  });
}

// 用户状态修改
export function changeUserStatus(data: ChangeStatusDto) {
  return $http<ChangeStatusDto, never>({
    url: `/system/user/changeStatus`,
    method: "put",
    data
  });
}

// 查询用户个人信息
export function getUserProfile() {
  return $http<never, RequestUserPayload>({
    url: `/system/user/profile`,
    method: "get"
  });
}

// 修改用户个人信息
export function updateUserProfile(data: UpdateProfileDto) {
  return $http<UpdateProfileDto, never>({
    url: `/system/user/profile`,
    method: "put",
    data
  });
}

// 用户密码重置
export function updateUserPwd(data: UpdatePwdDto) {
  return $http<UpdatePwdDto, never>({
    url: "/system/user/profile/updatePwd",
    method: "put",
    data
  });
}

// 用户头像上传
export function uploadAvatar(data: FormData) {
  return $http<FormData, { imgUrl: string }>({
    url: "/system/user/profile/avatar",
    method: "post",
    data
  });
}

// 查询授权角色
export function getAuthRole(userId: number) {
  return $http<never, { roles: SysRoleResponse[]; user: SysUserData }>({
    url: "/system/user/authRole/" + userId,
    method: "get"
  });
}

// 保存授权角色
export function updateAuthRole(data: { userId: number; roleIds: number[] }) {
  return $http<{ userId: number; roleIds: number[] }, never>({
    url: "/system/user/authRole",
    method: "put",
    data
  });
}
