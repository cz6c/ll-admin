import type { ListParams, ListResponse } from "#/api/index.d";
// 详情
export interface BannerItem {
  id: string;
  createTime: string;
  updateTime: string;
  hrefUrl: string;
  imgUrl: string;
  sortNum: number;
  status: boolean;
}

// 列表
export type BannerListResponse = ListResponse<BannerItem>;
export type BannerListParams = ListParams;
