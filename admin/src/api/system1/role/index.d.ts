import type { GetListParams, GetListResponse } from "#/api/index.d";

// 详情
export interface RoleItem {
  id: string;
  roleName: string;
  remark: string;
  menuIds: string | number[];
  status: 0 | 1;
  isDel: 0 | 1;
}
// 新增/编辑body
export interface RoleInfo extends Omit<RoleItem, "id" | "status" | "isDel"> {
  id?: string | number;
  status?: 0 | 1;
  isDel?: 0 | 1;
}
// 列表
export type RoleListResponse = GetListResponse<RoleItem>;
export interface RoleListParams extends GetListParams {
  roleName?: number;
}
