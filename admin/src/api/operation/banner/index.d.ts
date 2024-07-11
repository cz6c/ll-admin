import { GetListParams, GetListResponse } from "@/api/public/index.d";
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
export type BannerListResponse = GetListResponse<BannerItem>;
export type BannerListParams = GetListParams;
