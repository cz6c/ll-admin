import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type LoginlogData = {
  infoId: number;
  ipaddr?: string;
  userName?: string;
  loginLocation?: string;
  browser?: string;
  os?: string;
  msg?: string;
  status?: string;
};

export type LoginlogResponse = Required<LoginlogData> & BaseResponse;

export type LoginlogListResponse = ListResponse<LoginlogResponse>;

export type LoginlogListParams = ListParams & {
  ipaddr?: number;
  userName?: string;
  status?: string;
};
