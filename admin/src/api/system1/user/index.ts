import { createGet, createPost } from "@/utils/request";
import type { UserListParams, UserListResponse, UserItem } from "./index.d";

const basePath = `/user`;

// 获取列表
export const getUserListApi = createGet<UserListParams, UserListResponse>(`${basePath}/list`);

// 获取信息
export const getLoginUserInfoApi = createGet<never, UserItem>(`${basePath}/info`);

// 获取信息
export const getUserInfoApi = createGet<{ id: string }, UserItem>(`${basePath}/info`);
// 新增
export const createUserApi = createPost<Partial<UserItem>, never>(`${basePath}/create`);
// 编辑
export const updateUserApi = createPost<Partial<UserItem>, never>(`${basePath}/update`);
// 删除
export const delUserApi = createPost<{ id: string }, never>(`${basePath}/delete`);
