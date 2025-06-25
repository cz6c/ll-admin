import type { BaseResponse } from "#/api/index.d";

export type UpdateDeptDto = {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  leader: string;
  status: string;
  phone?: string;
  email?: string;
};

export type ListDeptDto = {
  deptName?: string;
  status?: string;
};

export type SysDeptVo = Required<UpdateDeptDto> & BaseResponse;

export type DeptTreeVo = SysDeptVo & {
  children: DeptTreeVo[];
};

export type RoleDeptTreeSelectVo = {
  depts: DeptTreeVo[];
  checkedIds: number[];
};
