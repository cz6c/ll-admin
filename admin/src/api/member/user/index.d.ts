import type { GetListParams, GetListResponse } from "#/api/index.d";
// 详情
export interface MemberItem {
  id: string;
  createTime: string;
  updateTime: string;
  username: string;
  nickname: string;
  avatar: string;
  birthday: string;
  gender: number;
  profession: string;
}

// 列表
export type MemberListResponse = GetListResponse<MemberItem>;
export interface MemberListParams extends GetListParams {
  username?: string;
}
