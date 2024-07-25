import { createGet, createPost } from "@/utils/request";
import type { ProductListParams, ProductListResponse, ProductItem } from "./index.d";

const basePath = `/product`;

// 获取列表
export const getProductListApi = createGet<ProductListParams, ProductListResponse>(`${basePath}/list`);

// 获取信息
export const getProductInfoApi = createGet<{ id: string }, ProductItem>(`${basePath}/info`);
// 新增
export const createProductApi = createPost<Partial<ProductItem>, never>(`${basePath}/create`);
// 编辑
export const updateProductApi = createPost<Partial<ProductItem>, never>(`${basePath}/update`);
// 状态切换
export const statusChangeApi = createGet<{ id: string }, never>(`${basePath}/statusCheck`);
// 删除
export const delProductApi = createPost<{ id: string }, never>(`${basePath}/delete`);

// 批量删除sku
export const betchDelSkuApi = createPost<{ ids: string[] }, never>(`/admin/sku/delete`);

// 批量删除规格
export const betchDelSpecsApi = createPost<{ ids: string[] }, never>(`/admin/specs/delete`);
