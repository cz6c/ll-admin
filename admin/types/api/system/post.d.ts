import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type SysPostData = {
  postId: number;
  postName: string;
  postCode: string;
  status?: string;
  remark?: string;
  postSort?: number;
};

export type SysPostResponse = Required<SysPostData> & BaseResponse;
export type SysPostListResponse = ListResponse<SysPostResponse>;

export type ListPostDto = ListParams & {
  postName?: string;
  postCode?: string;
  status?: string;
};
