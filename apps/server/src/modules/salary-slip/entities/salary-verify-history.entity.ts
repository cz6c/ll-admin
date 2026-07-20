import { BaseEntity } from "@/common/entities/base";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { SalaryHistoryTypeEnum, YearEndTaxModeEnum } from "../enums/salary-history.enum";

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
}
