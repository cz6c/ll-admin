import { createGet, createPost } from "@/utils/request";
import { BannerListParams, BannerListResponse, BannerItem } from "./index.d";

const basePath = `/banner`;

// 获取列表
export const getBannerListApi = createGet<BannerListParams, BannerListResponse>(`${basePath}/list`);

// 获取信息
export const getBannerInfoApi = createGet<{ id: string }, BannerItem>(`${basePath}/info`);
// 新增
export const createBannerApi = createPost<Partial<BannerItem>, never>(`${basePath}/create`);
// 编辑
export const updateBannerApi = createPost<Partial<BannerItem>, never>(`${basePath}/update`);
// 删除
export const delBannerApi = createPost<{ id: string }, never>(`${basePath}/delete`);
// 状态切换
export const statusChangeApi = createGet<{ id: string }, never>(`${basePath}/statusCheck`);
