import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type SysRoleData = {
  roleId: number;
  roleName: string;
  roleKey: string;
  menuIds?: Array<number>;
  deptIds?: Array<number>;
  roleSort?: number;
  status?: string;
  dataScope?: string;
  remark?: string;
  menuCheckStrictly?: boolean;
  deptCheckStrictly?: boolean;
};

export type SysRoleResponse = Required<SysRoleData> & BaseResponse;
export type SysRoleListResponse = ListResponse<SysRoleResponse>;

export type ListRoleDto = ListParams & {
  roleName?: string;
  roleKey?: string;
  status?: string;
  roleId?: string;
};

export type ChangeStatusDto = {
  roleId: number;
  status: string;
};

export type AuthUserCancelDto = {
  roleId: number;
  userId: number;
};

export type AuthUserCancelAllDto = {
  roleId: number;
  userIds: string;
};

export type AuthUserSelectAllDto = AuthUserCancelAllDto;
