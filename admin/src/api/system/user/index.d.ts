import { GetListParams, GetListResponse } from "@/api/public/index.d";
// 详情
export interface UserItem {
  userId: number;
  id: string;
  createTime: string;
  updateTime: string;
  username: string;
  nickname: string;
  avatar: string;
  birthday: string;
  gender: Gender;
  profession: string;
}

// 列表
export type UserListResponse = GetListResponse<UserItem>;
export interface UserListParams extends GetListParams {
  username?: string;
}

/** 性别枚举 */
export enum Gender {
  /** 男 */
  男 = 1,
  /** 女 */
  女 = 2,
}
