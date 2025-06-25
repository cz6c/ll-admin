import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type UpdateConfigDto = {
  configId: number;
  configName: string;
  configValue: string;
  configKey: string;
  configType: string;
  remark?: string;
};

export type ListConfigDto = ListParams & {
  configName?: string;
  configKey?: string;
  configType?: string;
};

export type SysConfigVo = Required<UpdateConfigDto> & BaseResponse;

export type SysConfigListResponse = ListResponse<SysConfigVo>;
