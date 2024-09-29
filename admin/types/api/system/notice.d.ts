import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type SysNoticeData = {
  noticeId: number;
  noticeTitle: string;
  noticeType: string;
  noticeContent: string;
  status?: string;
};

export type SysNoticeResponse = Required<SysNoticeData> & BaseResponse;
export type SysNoticeListResponse = ListResponse<SysNoticeResponse>;

export type ListNoticeDto = ListParams & {
  noticeTitle?: string;
  noticeType?: string;
  createBy?: string;
};
