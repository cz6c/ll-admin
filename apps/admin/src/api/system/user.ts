import { $http } from "@/utils/request";
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
  return $http<never, SysUserListResponse>({
    url: `/system/user/list`,
    method: "get",
    params
  });
}

// 查询用户详细
export function getUser(userId: number) {
  return $http<never, UserInfoVo>({
    url: `/system/user/${userId}`,
    method: "get"
  });
}

// 新增用户
export function addUser(data: UpdateUserDto) {
  return $http<UpdateUserDto, never>({
    url: `/system/user`,
    method: "post",
    data
  });
}

// 修改用户
export function updateUser(data: UpdateUserDto) {
  return $http<UpdateUserDto, never>({
    url: `/system/user/update`,
    method: "post",
    data
  });
}

// 删除用户
export function delUser(userIds: string) {
  return $http({
    url: `/system/user/delete/${userIds}`,
    method: "get"
  });
}

// 用户密码重置
export function resetUserPwd(data: ResetPwdDto) {
  return $http<ResetPwdDto, never>({
    url: `/system/user/resetPwd`,
    method: "post",
    data
  });
}

// 用户状态修改
export function changeUserStatus(data: ChangeStatusDto) {
  return $http<ChangeStatusDto, never>({
    url: `/system/user/changeStatus`,
    method: "post",
    data
  });
}

// 查询用户个人信息
export function getUserProfile() {
  return $http<never, UserProfileVo>({
    url: `/system/user/profile`,
    method: "get"
  });
}

// 修改用户个人信息
export function updateUserProfile(data: UpdateProfileDto) {
  return $http<UpdateProfileDto, never>({
    url: `/system/user/profile`,
    method: "post",
    data
  });
}

// 用户密码重置
export function updateUserPwd(data: UpdatePwdDto) {
  return $http<UpdatePwdDto, never>({
    url: "/system/user/profile/updatePwd",
    method: "post",
    data
  });
}

// 用户头像上传
export function uploadAvatar(data: { avatar: string }) {
  return $http<{ avatar: string }, never>({
    url: "/system/user/profile/avatar",
    method: "post",
    data
  });
}
