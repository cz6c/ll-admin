import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

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
  posts: any[];
  roles: any[];
  roleIds: number[];
};

export type SysUserListParams = ListParams & {
  deptId?: string;
  nickName?: string;
  email?: string;
  userName?: string;
  phonenumber?: string;
  status?: string;
};

export type SysUserListResponse = ListResponse<SysUserResponse>;
