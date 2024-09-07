import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type SysConfigData = {
  configId: number;
  configName: string;
  configValue: string;
  configKey: string;
  configType: string;
  remark?: string;
  status?: string;
};

export type SysConfigResponse = Required<SysConfigData> & BaseResponse;
export type SysConfigListResponse = ListResponse<SysConfigResponse>;

export type ListConfigDto = ListParams & {
  configName?: string;
  configKey?: string;
  configType?: string;
};
