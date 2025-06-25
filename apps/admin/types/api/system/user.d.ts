import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";
import type { SysDeptVo } from "#/api/system/dept.d";
import type { SysPostVo } from "#/api/system/post.d";
import type { SysRoleVo } from "#/api/system/role.d";

export type UpdateUserDto = {
  userId: number;
  nickName: string;
  userName: string;
  password: string;
  phonenumber: string;
  postIds: Array<number>;
  roleIds: Array<number>;
  userType: string;
  status: string;
  sex: string;
  deptId?: number;
  email?: string;
  remark?: string;
};

export type ChangeStatusDto = Pick<UpdateUserDto, "userId" | "status">;

export type UpdateProfileDto = Pick<UpdateUserDto, "nickName" | "email" | "sex">;

export type ResetPwdDto = {
  userId: number;
  password: string;
};

export type UpdatePwdDto = {
  oldPassword: string;
  newPassword: string;
};

export type UpdateAuthRoleDto = {
  userId: number;
  roleIds: Array<number>;
};

export type SysUserListParams = ListParams & {
  deptId?: number;
  nickName?: string;
  email?: string;
  userName?: string;
  phonenumber?: string;
  status?: string;
};

export type UserVo = BaseResponse & {
  userId: number;
  deptId: number;
  dept: SysDeptVo;
  userName: string;
  nickName: string;
  userType: string;
  email: string;
  phonenumber: string;
  sex: string;
  avatar: string;
  loginIp: string;
  loginDate: Date;
  remark: string;
};

export type SysUserListResponse = ListResponse<UserVo>;

export type UserInfoVo = UserVo & {
  roleIds: number[];
  postIds: number[];
};

export type UserProfileVo = UserVo & {
  roles: Array<SysRoleVo>;
  posts: Array<SysPostVo>;
};
