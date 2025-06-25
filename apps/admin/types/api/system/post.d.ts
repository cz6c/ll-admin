import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type UpdatePostDto = {
  postId: number;
  postName: string;
  postCode: string;
  status: string;
  postSort: number;
  remark?: string;
};

export type ListPostDto = ListParams & {
  postName?: string;
  postCode?: string;
  status?: string;
};

export type SysPostVo = Required<UpdatePostDto> & BaseResponse;

export type SysPostListResponse = ListResponse<SysPostVo>;
