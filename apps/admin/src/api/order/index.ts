import { createGet, createPost } from "@/utils/request";
import type { OrderListParams, OrderListResponse, OrderItem } from ".";

const basePath = "/order";

// 获取列表
export const getOrderListApi = createGet<OrderListParams, OrderListResponse>(`${basePath}/list`);

// 获取信息
export const getOrderInfoApi = createGet<{ id: string }, OrderItem>(`${basePath}/info`);
// 新增
export const createOrderApi = createPost<Partial<OrderItem>, never>(`${basePath}/create`);
// 编辑
export const updateOrderApi = createPost<Partial<OrderItem>, never>(`${basePath}/update`);
// 删除
export const delOrderApi = createPost<{ id: string }, never>(`${basePath}/delete`);
