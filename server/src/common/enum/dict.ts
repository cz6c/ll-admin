/**
 * 删除标志:0代表存在 1代表删除
 */
export enum DelFlagEnum {
  /**
   * 存在
   */
  NORMAL = '0',
  /**
   * 删除
   */
  DELETE = '1',
}
export const DelFlag = {
  [DelFlagEnum.NORMAL]: '存在',
  [DelFlagEnum.DELETE]: '删除',
};

/**
 * 数据状态:0正常,1停用
 */
export enum StatusEnum {
  /**
   * 正常
   */
  NORMAL = '0',
  /**
   * 停用
   */
  STOP = '1',
}
export const Status = {
  [StatusEnum.NORMAL]: '正常',
  [StatusEnum.STOP]: '停用',
};

/**
 * 用户类型 00系统用户,10自定义用户
 */
export enum UserTypeEnum {
  /**
   * 系统用户
   */
  SYS = '00',
  /**
   * 自定义用户
   */
  CUSTOM = '10',
}
export const UserType = {
  [UserTypeEnum.SYS]: '系统用户',
  [UserTypeEnum.CUSTOM]: '自定义用户',
};

/**
 * 用户性别 0男,1女
 */
export enum UserSexEnum {
  /**
   * 男
   */
  MAN = '0',
  /**
   * 女
   */
  WOMAN = '1',
}
export const UserSex = {
  [UserSexEnum.MAN]: '男',
  [UserSexEnum.WOMAN]: '女',
};

/**
 * 菜单类型（M菜单 F按钮）
 */
export enum MenuTypeEnum {
  /**
   * 菜单
   */
  M = 'M',
  /**
   * 按钮
   */
  F = 'F',
}
export const MenuType = {
  [MenuTypeEnum.M]: '菜单',
  [MenuTypeEnum.F]: '按钮',
};

/**
 *  是否系统内置
 */
export enum ConfigTypeEnum {
  /**
   *  是
   */
  YES = 'Y',
  /**
   *  否
   */
  NO = 'N',
}
export const ConfigType = {
  [ConfigTypeEnum.YES]: '是',
  [ConfigTypeEnum.NO]: '否',
};

/**
 *  公告类型（1通知 2公告）
 */
export enum NoticeTypeEnum {
  /**
   *  通知
   */
  Instruct = '1',
  /**
   *  公告
   */
  Notice = '2',
}
export const NoticeType = {
  [NoticeTypeEnum.Instruct]: '通知',
  [NoticeTypeEnum.Notice]: '公告',
};

/**
 * 推送类型:1定期推送,2按时推送
 */
export enum PushModelEnum {
  /**
   * 定期推送
   */
  REGULAR = '1',
  /**
   * 按时推送
   */
  PUNCTUAL = '2',
}
export const PushModel = {
  [PushModelEnum.REGULAR]: '定期推送',
  [PushModelEnum.PUNCTUAL]: '按时推送',
};

/**
 * 定期推送间隔:1每日 2每周 3每月
 */
export enum PushIntervalEnum {
  /**
   * 每日
   */
  EVERYDAY = '1',
  /**
   * 每周
   */
  WEEKLY = '2',
  /**
   * 每月
   */
  MONTHLY = '3',
}
export const PushInterval = {
  [PushIntervalEnum.EVERYDAY]: '每日',
  [PushIntervalEnum.WEEKLY]: '每周',
  [PushIntervalEnum.MONTHLY]: '每月',
};

/**
 * 推送状态:1成功,2失败
 */
export enum PushStatusEnum {
  /**
   * 成功
   */
  SUCCESS = '1',
  /**
   * 失败
   */
  FAIL = '2',
}
export const PushStatus = {
  [PushStatusEnum.SUCCESS]: '成功',
  [PushStatusEnum.FAIL]: '失败',
};
