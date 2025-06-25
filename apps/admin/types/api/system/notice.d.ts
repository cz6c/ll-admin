import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type UpdateNoticeDto = {
  noticeId: number;
  noticeTitle: string;
  noticeType: string;
  noticeContent: string;
  status: string;
};

export type ListNoticeDto = ListParams & {
  noticeTitle?: string;
  noticeType?: string;
  createBy?: string;
};

export type SysNoticeVo = Required<UpdateNoticeDto> & BaseResponse;

export type SysNoticeListResponse = ListResponse<SysNoticeVo>;
