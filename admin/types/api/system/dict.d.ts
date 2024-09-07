import type { BaseResponse, ListParams, ListResponse } from "#/api/index.d";

export type SysDictTypeData = {
  dictId: number;
  dictName: string;
  dictType: string;
  remark?: string;
  status?: string;
};

export type SysDictTypeResponse = Required<SysDictTypeData> & BaseResponse;
export type SysDictTypeListResponse = ListResponse<SysDictTypeResponse>;

export type ListDictTypeDto = ListParams & {
  dictName?: string;
  dictType?: string;
  status?: string;
};

export type SysDictData = {
  dictCode: number;
  dictType: string;
  dictLabel: string;
  dictValue: string;
  listClass: string;
  dictSort?: number;
  remark?: string;
  status?: string;
};

export type SysDictResponse = Required<SysDictData> & BaseResponse;
export type SysDictListResponse = ListResponse<SysDictResponse>;

export type ListDictDto = ListParams & {
  dictLabel?: string;
  dictType?: string;
  status?: string;
};
