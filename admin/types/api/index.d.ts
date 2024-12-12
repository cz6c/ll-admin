// 列表请求
export interface ListParams {
  pageNum?: number;
  pageSize?: number;
  beginTime?: string;
  endTime?: string;
  orderByColumn?: string;
  order?: "ascending" | "descending";
}
// 列表响应
export interface ListResponse<T> {
  list: Array<T>;
  total: number;
}

// 登录参数
export interface LoginParams {
  userName: string;
  password: string;
  code: string;
  uuid: string;
}

// 公共数据
export interface BaseResponse {
  //0正常 1停用
  status: "0" | "1";
  //0代表存在 1代表删除
  delFlag: "0" | "1";
  // 创建者
  createBy: string;
  // 创建时间
  createTime: Date;
  // 更新者
  updateBy: string;
  // 更新时间
  updateTime: Date;
  //备注
  remark: string;
}

export type SysDictData = {
  dictLabel: string;
  dictValue: string;
};

export type SysDictResponse = Required<SysDictData>;
