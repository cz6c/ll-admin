import { BaseEntity } from "@/common/entities/base";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { SalaryHistoryTypeEnum, SalaryReportBiasEnum, YearEndTaxModeEnum } from "../enums/salary-history.enum";

/**
 * 薪资历史表实体（月薪核对 verify + 年薪测算 calc 共表）
 * 唯一索引：(userId, historyType, payPeriod)；calc 的 payPeriod 为 NULL 允许多条
 * @note decimal 列 TypeORM 以 string 返回，避免 JS number 精度丢失；DTO 层再 Number()
 */
@Entity("salary_verify_history", { comment: "薪资历史表（月薪核对/年薪测算）" })
@Index("idx_salary_verify_history_user_period", ["userId", "historyType", "payPeriod"], { unique: true })
@Index("idx_salary_verify_history_user_list", ["userId", "delFlag", "historyType"])
export class SalaryVerifyHistoryEntity extends BaseEntity {
  /** 存量表主键为 id；新表应优先用域前缀 *_id */
  @PrimaryGeneratedColumn({ type: "int", comment: "主键ID" })
  public id: number;

  /** 逻辑外键：sys_user.user_id；不建库级 FK */
  @Column({ type: "int", name: "user_id", comment: "用户ID" })
  public userId: number;

  @Column({
    type: "enum",
    enum: SalaryHistoryTypeEnum,
    name: "history_type",
    default: SalaryHistoryTypeEnum.VERIFY,
    comment: "历史类型：verify月薪核对/calc年薪测算"
  })
  public historyType: SalaryHistoryTypeEnum;

  @Column({
    type: "varchar",
    name: "pay_period",
    length: 7,
    nullable: true,
    comment: "工资所属月份 YYYY-MM（verify 类型必填；calc 为 NULL，允许多条）"
  })
  public payPeriod: string | null;

  @Column({
    type: "decimal",
    name: "pre_tax_monthly",
    precision: 12,
    scale: 2,
    default: 0,
    comment: "税前工资"
  })
  public preTaxMonthly: string;

  @Column({
    type: "decimal",
    name: "ss_personal_amount",
    precision: 12,
    scale: 2,
    default: 0,
    comment: "个人社保"
  })
  public ssPersonalAmount: string;

  @Column({
    type: "decimal",
    name: "hf_personal_amount",
    precision: 12,
    scale: 2,
    default: 0,
    comment: "个人公积金"
  })
  public hfPersonalAmount: string;

  /**
   * 其他扣款（缺勤等）：只影响实发自洽，不进累计预扣专项扣除
   */
  @Column({
    type: "decimal",
    name: "other_deduction_amount",
    precision: 12,
    scale: 2,
    default: 0,
    comment: "其他扣款（缺勤等，不含个税抵扣）"
  })
  public otherDeductionAmount: string;

  @Column({
    type: "decimal",
    name: "special_deduction_monthly",
    precision: 12,
    scale: 2,
    default: 0,
    comment: "专项附加扣除"
  })
  public specialDeductionMonthly: string;

  @Column({
    type: "decimal",
    name: "personal_income_tax",
    precision: 12,
    scale: 2,
    default: 0,
    comment: "个税"
  })
  public personalIncomeTax: string;

  @Column({
    type: "enum",
    enum: YearEndTaxModeEnum,
    name: "year_end_tax_mode",
    nullable: true,
    default: null,
    comment: "年终奖计税方式：none/separate/merge"
  })
  public yearEndTaxMode: YearEndTaxModeEnum | null;

  @Column({
    type: "decimal",
    name: "year_end_bonus",
    precision: 12,
    scale: 2,
    default: 0,
    comment: "年终奖"
  })
  public yearEndBonus: string;

  @Column({
    type: "decimal",
    name: "post_tax_monthly",
    precision: 12,
    scale: 2,
    default: 0,
    comment: "税后工资"
  })
  public postTaxMonthly: string;

  /**
   * 用户确认「按申报口径继续核对」后写入的反推应发；未确认为 null
   * @note 不覆盖 preTaxMonthly；仅参与后续月累计 prior
   */
  @Column({
    type: "decimal",
    name: "inferred_pre_tax",
    precision: 12,
    scale: 2,
    nullable: true,
    default: null,
    comment: "反推申报应发（用户确认后落库）"
  })
  public inferredPreTax: string | null;

  @Column({
    type: "enum",
    enum: SalaryReportBiasEnum,
    name: "report_bias",
    nullable: true,
    default: null,
    comment: "申报偏差：under少报/over多报"
  })
  public reportBias: SalaryReportBiasEnum | null;

  @Column({
    type: "tinyint",
    name: "use_inferred_for_cumulative",
    width: 1,
    default: 0,
    comment: "是否用反推应发参与后续累计预扣"
  })
  public useInferredForCumulative: boolean;
}
