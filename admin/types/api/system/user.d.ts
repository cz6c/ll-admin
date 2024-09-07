import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";
import type { SysDeptResponse } from "#/api/system/dept.d";
import type { SysPostResponse } from "#/api/system/post.d";
import type { SysRoleResponse } from "#/api/system/role.d";

export type SysUserData = {
  userId: number;
  deptId?: number;
  email: string;
  nickName: string;
  userName: string;
  password: string;
  phonenumber?: string;
  postIds?: Array<number>;
  roleIds?: Array<number>;
  status?: string;
  sex?: string;
  remark?: string;
  postSort?: number;
};

export type SysUserResponse = {
  data: Required<SysUserData> & BaseResponse;
  postIds: number[];
  roleIds: number[];
};
export type SysUserListResponse = ListResponse<SysUserResponse>;
export type SysPostAndPostResponse = {
  posts: SysPostResponse[];
  roles: SysRoleResponse[];
};

export type SysUserListParams = ListParams & {
  deptId?: string;
  nickName?: string;
  email?: string;
  userName?: string;
  phonenumber?: string;
  status?: string;
};

export type AllocatedListDto = ListParams & {
  userName?: string;
  phonenumber?: string;
  roleId?: string;
};

export type ResetPwdDto = {
  userId: number;
  password: string;
};

export type ChangeStatusDto = {
  userId: number;
  status: string;
};

export type UpdateProfileDto = {
  nickName: string;
  email: string;
  phonenumber: string;
  sex: string;
};

export type UpdatePwdDto = {
  oldPassword: string;
  newPassword: string;
};

export type RequestUserPayload = {
  browser: string;
  ipaddr: string;
  loginLocation: string;
  loginTime: Date;
  os: string;
  roles: string[];
  token: string;
  user: SysUserData & {
    dept: SysDeptResponse;
    roles: Array<SysRoleResponse>;
    posts: Array<SysPostResponse>;
  };
  userId: number;
  username: string;
  deptId: number;
};
