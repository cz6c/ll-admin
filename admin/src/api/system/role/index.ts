import { createGet, createPost } from "@/utils/request";
import { RoleListParams, RoleListResponse, RoleItem, RoleInfo } from "./index.d";

// 获取列表
export const getRoleListApi = createGet<RoleListParams, RoleListResponse>("/role/list");
// 获取信息
export const getRoleInfoApi = createGet<{ id: string }, RoleItem>("/role/info");
// 新增
export const saveRoleApi = createPost<RoleInfo, unknown>("/role/save");
// 编辑
export const updateRoleApi = createPost<RoleInfo, unknown>("/role/update");
// 状态切换
export const statusChangeApi = createPost<{ id: string; status: 0 | 1 }, unknown>("/role/status");
// 删除
export const delRoleApi = createPost<{ id: string }, unknown>("/role/del");
