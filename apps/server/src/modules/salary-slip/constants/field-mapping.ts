export interface FieldMapping {
  fixedSalaryKeys: string[];
  welfareKeys: string[];
  deductionKeys: string[];
  grossAliases: string[];
  netAliases: string[];
  deductionSubtotalAliases: string[];
}

/** 工资条字段别名，业务配置放在模块内维护，不写入 dev.yml */
export const SALARY_SLIP_FIELD_MAPPING: FieldMapping = {
  fixedSalaryKeys: ["基本工资", "岗位工资", "岗位津贴", "住房补贴", "薪级工资", "职务工资", "级别工资"],
  welfareKeys: ["全勤奖", "管理津贴", "绩效工资", "绩效", "补贴", "交通补贴", "通讯补贴", "餐补", "奖金", "津贴"],
  deductionKeys: ["社保", "医疗保险", "医保", "养老保险", "公积金", "个税", "个人所得税", "缺勤扣款", "缺勤", "企业年金", "工会费"],
  grossAliases: ["应发工资", "应发合计", "应发", "税前工资", "应发金额"],
  netAliases: ["实发工资", "实发合计", "实发", "到手工资", "实发金额"],
  deductionSubtotalAliases: ["扣款小计", "扣款合计", "小计", "代扣合计"]
};

/** @deprecated 使用 SALARY_SLIP_FIELD_MAPPING */
export const DEFAULT_FIELD_MAPPING = SALARY_SLIP_FIELD_MAPPING;
