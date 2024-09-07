import type { BaseResponse } from "#/api/index.d";

export type SysDeptData = {
  deptId: number;
  parentId: number;
  deptName: string;
  orderNum: number;
  leader?: string;
  phone?: string;
  email?: string;
  status?: string;
};

export type SysDeptResponse = Required<SysDeptData> & BaseResponse;
export type SysDeptListResponse = SysDeptResponse[];

export type ListDeptDto = {
  deptName?: string;
  status?: string;
};
