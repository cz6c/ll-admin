import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type UpdateRoleDto = {
  roleId: number;
  roleName: string;
  roleKey: string;
  menuIds: Array<number>;
  deptIds: Array<number>;
  roleSort: number;
  status: string;
  dataScope: string;
  remark?: string;
};

export type ChangeStatusDto = Pick<UpdateRoleDto, "roleId" | "status">;

export type ListRoleDto = ListParams & {
  roleName?: string;
  roleKey?: string;
  status?: string;
  roleId?: string;
};

export type SysRoleVo = Required<UpdateRoleDto> & BaseResponse;

export type SysRoleListResponse = ListResponse<SysRoleVo>;
