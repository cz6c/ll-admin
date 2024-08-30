import type { ListParams, ListResponse } from "#/api/index.d";
// 详情
export interface UserItem {
  userId: number;
  id: string;
  createTime: string;
  updateTime: string;
  username: string;
  nickName: string;
  avatar: string;
  birthday: string;
  gender: Gender;
  profession: string;
}

// 列表
export type UserListResponse = ListResponse<UserItem>;
export interface UserListParams extends ListParams {
  username?: string;
}

/** 性别枚举 */
export enum Gender {
  /** 男 */
  男 = 1,
  /** 女 */
  女 = 2
}
