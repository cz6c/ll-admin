/** 薪资历史类型：月薪核对 / 年薪测算 */
export enum SalaryHistoryTypeEnum {
  /** 月薪核对（按 payPeriod 唯一） */
  VERIFY = "verify",
  /** 年薪测算快照 */
  CALC = "calc"
}

/** 年终奖计税方式（仅 calc 历史） */
export enum YearEndTaxModeEnum {
  /** 不计年终奖税 */
  NONE = "none",
  /** 年终奖单独计税 */
  SEPARATE = "separate",
  /** 并入综合所得 */
  MERGE = "merge"
}

/**
 * 核对反推：申报应发相对工资条应发的偏差方向（用户确认后落库）
 * under：少报；over：多报
 */
export enum SalaryReportBiasEnum {
  /** 公司申报应发低于工资条（少报） */
  UNDER = "under",
  /** 公司申报应发高于工资条（多报） */
  OVER = "over"
}
