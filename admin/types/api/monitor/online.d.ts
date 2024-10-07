import type { ListParams, ListResponse } from "#/api/index.d";

export type OnlineData = {
  tokenId: string;
  deptName: string;
  userName: string;
  ipaddr: string;
  loginLocation: string;
  browser: string;
  os: string;
  loginTime: string;
};

export type OnlineListResponse = ListResponse<OnlineData>;

export type OnlineListParams = ListParams & {
  ipaddr?: number;
  userName?: string;
};
