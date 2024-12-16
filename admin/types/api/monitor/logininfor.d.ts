import type { ListParams, ListResponse } from "#/api/index.d";

export type LoginlogListParams = ListParams & {
  ipaddr?: number;
  userName?: string;
  status?: string;
};

export type MonitorLoginlogVO = {
  infoId: number;
  userName: string;
  ipaddr: string;
  loginLocation: string;
  browser: string;
  os: string;
  loginTime: Date;
  msg: string;
  status: string;
};

export type LoginlogListResponse = ListResponse<MonitorLoginlogVO>;
