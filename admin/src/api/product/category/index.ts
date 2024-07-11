import { createGet, createPost } from "@/utils/request";
import { CategoryItem } from "./index.d";

const basePath = `/category`;

// 获取树列表
export const getCategoryTreesApi = createGet<never, CategoryItem[]>(`${basePath}/trees`);

// 获取信息
export const getCategoryInfoApi = createGet<{ id: string }, CategoryItem>(`${basePath}/info`);
// 新增
export const createCategoryApi = createPost<Partial<CategoryItem>, never>(`${basePath}/create`);
// 编辑
export const updateCategoryApi = createPost<Partial<CategoryItem>, never>(`${basePath}/update`);
// 删除
export const delCategoryApi = createPost<{ id: string }, never>(`${basePath}/delete`);
