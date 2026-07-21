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
