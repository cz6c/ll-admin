import $http from "@/utils/request";
import type {
  UpdateUserDto,
  SysUserListParams,
  SysUserListResponse,
  ResetPwdDto,
  ChangeStatusDto,
  UserProfileVo,
  UpdateProfileDto,
  UpdatePwdDto,
  UserInfoVo
} from "#/api/system/user";

// 查询用户列表
export function listUser(params: SysUserListParams) {
  return $http.request<never, SysUserListResponse>({
    url: `/system/user/list`,
    method: "get",
    params
  });
}

// 查询用户详细
export function getUser(userId: number) {
  return $http.request<never, UserInfoVo>({
    url: `/system/user/${userId}`,
    method: "get"
  });
}

// 新增用户
export function addUser(data: UpdateUserDto) {
  return $http.request<UpdateUserDto, never>({
    url: `/system/user`,
    method: "post",
    data
  });
}

// 修改用户
export function updateUser(data: UpdateUserDto) {
  return $http.request<UpdateUserDto, never>({
    url: `/system/user/update`,
    method: "post",
    data
  });
}

// 删除用户
export function delUser(userIds: string) {
  return $http.request({
    url: `/system/user/delete/${userIds}`,
    method: "get"
  });
}

// 用户密码重置
export function resetUserPwd(data: ResetPwdDto) {
  return $http.request<ResetPwdDto, never>({
    url: `/system/user/resetPwd`,
    method: "post",
    data
  });
}

// 用户状态修改
export function changeUserStatus(data: ChangeStatusDto) {
  return $http.request<ChangeStatusDto, never>({
    url: `/system/user/changeStatus`,
    method: "post",
    data
  });
}

// 查询用户个人信息
export function getUserProfile() {
  return $http.request<never, UserProfileVo>({
    url: `/system/user/profile`,
    method: "get"
  });
}

// 修改用户个人信息
export function updateUserProfile(data: UpdateProfileDto) {
  return $http.request<UpdateProfileDto, never>({
    url: `/system/user/profile`,
    method: "post",
    data
  });
}

// 用户密码重置
export function updateUserPwd(data: UpdatePwdDto) {
  return $http.request<UpdatePwdDto, never>({
    url: "/system/user/profile/updatePwd",
    method: "post",
    data
  });
}

// 用户头像上传
export function uploadAvatar(data: { avatar: string }) {
  return $http.request<{ avatar: string }, never>({
    url: "/system/user/profile/avatar",
    method: "post",
    data
  });
}
