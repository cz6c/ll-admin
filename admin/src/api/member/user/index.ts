import { createGet, createPost } from "@/utils/request";
import { MemberListParams, MemberListResponse, MemberItem } from "./index.d";

const basePath = "/member";

// 获取列表
export const getMemberListApi = createGet<MemberListParams, MemberListResponse>(`${basePath}/list`);

// 获取信息
export const getMemberInfoApi = createGet<{ id: string }, MemberItem>(`${basePath}/info`);
// 新增
export const createMemberApi = createPost<Partial<MemberItem>, never>(`${basePath}/create`);
// 编辑
export const updateMemberApi = createPost<Partial<MemberItem>, never>(`${basePath}/update`);
// 删除
export const delMemberApi = createPost<{ id: string }, never>(`${basePath}/delete`);
