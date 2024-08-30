import type { ListParams, ListResponse } from "#/api/index.d";
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
export type MemberListResponse = ListResponse<MemberItem>;
export interface MemberListParams extends ListParams {
  username?: string;
}
