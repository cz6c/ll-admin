import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateIf } from "class-validator";
import { SalaryHistoryTypeEnum, SalaryReportBiasEnum, YearEndTaxModeEnum } from "../enums/salary-history.enum";

/** 与枚举对齐的类型别名，便于 DTO/Service 引用 */
export type SalaryHistoryType = SalaryHistoryTypeEnum;
export type YearEndTaxMode = YearEndTaxModeEnum;
export type SalaryReportBias = SalaryReportBiasEnum;

/**
 * 新增或更新薪资历史
 * - 传 id：按 id 更新本人未删记录（重新测算 / 重新核对编辑）
 * - 不传 id：verify 按 user+type+period upsert；calc 新增测算快照
 */
export class UpsertSalaryVerifyHistoryDto {
  @ApiPropertyOptional({
    description: "已有记录 id；传入则按 id 更新（编辑），须与 historyType 一致",
    example: 1
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  id?: number;

  @ApiPropertyOptional({
    description: "历史类型：verify 月薪核对，calc 年薪测算。为空时默认 verify",
    enum: SalaryHistoryTypeEnum,
    example: SalaryHistoryTypeEnum.VERIFY
  })
  @IsOptional()
  @IsEnum(SalaryHistoryTypeEnum)
  historyType?: SalaryHistoryType;

  @ApiPropertyOptional({ description: "工资所属月份，格式 YYYY-MM（verify 类型必填）", example: "2026-06" })
  @ValidateIf(dto => (dto.historyType ?? SalaryHistoryTypeEnum.VERIFY) === SalaryHistoryTypeEnum.VERIFY)
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "payPeriod 格式应为 YYYY-MM" })
  payPeriod?: string;


  @ApiProperty({ description: "税前工资", example: 15000 })
  @Type(() => Number)
  @IsNumber()
  preTaxMonthly: number;

  @ApiPropertyOptional({ description: "个人社保", example: 1200 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  ssPersonalAmount?: number;

  @ApiPropertyOptional({ description: "个人公积金", example: 1200 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  hfPersonalAmount?: number;

  @ApiPropertyOptional({
    description: "其他扣款（缺勤等，不含个税抵扣；不进累计预扣）",
    example: 200
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  otherDeductionAmount?: number;

  @ApiPropertyOptional({ description: "专项附加扣除", example: 2000 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  specialDeductionMonthly?: number;

  @ApiProperty({ description: "个人所得税", example: 320.45 })
  @ValidateIf(dto => (dto.historyType ?? SalaryHistoryTypeEnum.VERIFY) === SalaryHistoryTypeEnum.VERIFY)
  @Type(() => Number)
  @IsNumber()
  personalIncomeTax?: number;

  @ApiProperty({ description: "税后工资", example: 12279.55 })
  @ValidateIf(dto => (dto.historyType ?? SalaryHistoryTypeEnum.VERIFY) === SalaryHistoryTypeEnum.VERIFY)
  @Type(() => Number)
  @IsNumber()
  postTaxMonthly?: number;

  @ApiPropertyOptional({
    description: "年终奖计税方式（calc 类型必填）",
    enum: YearEndTaxModeEnum,
    example: YearEndTaxModeEnum.SEPARATE
  })
  @ValidateIf(dto => (dto.historyType ?? SalaryHistoryTypeEnum.VERIFY) === SalaryHistoryTypeEnum.CALC)
  @IsEnum(YearEndTaxModeEnum)
  yearEndTaxMode?: YearEndTaxMode;

  @ApiPropertyOptional({ description: "年终奖（calc 类型必填）", example: 20000 })
  @ValidateIf(dto => (dto.historyType ?? SalaryHistoryTypeEnum.VERIFY) === SalaryHistoryTypeEnum.CALC)
  @Type(() => Number)
  @IsNumber()
  yearEndBonus?: number;

  /**
   * 反推申报应发；传 null 清空。未传则更新时保留原值。
   * @note 仅用户确认「按申报口径」后应由客户端写入
   */
  @ApiPropertyOptional({ description: "反推申报应发；null 清空", example: 12000, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  inferredPreTax?: number | null;

  @ApiPropertyOptional({
    description: "申报偏差 under/over；null 清空",
    enum: SalaryReportBiasEnum,
    nullable: true
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsEnum(SalaryReportBiasEnum)
  reportBias?: SalaryReportBias | null;

  @ApiPropertyOptional({ description: "是否用反推应发参与后续累计；未传则更新时保留原值", example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  useInferredForCumulative?: boolean;
}

/** 历史列表/写入接口返回的单条 */
export class SalaryVerifyHistoryItemDto {
  @ApiProperty({ description: "历史记录ID", example: 1 })
  id: number;

  @ApiProperty({ description: "历史类型：verify 月薪核对，calc 年薪测算", enum: SalaryHistoryTypeEnum, example: SalaryHistoryTypeEnum.VERIFY })
  historyType: SalaryHistoryType;

  @ApiProperty({ description: "工资所属月份，格式 YYYY-MM", example: "2026-06" })
  payPeriod: string | null;

  @ApiProperty({ description: "税前工资", example: 15000 })
  preTaxMonthly: number;

  @ApiProperty({ description: "个人社保", example: 1200 })
  ssPersonalAmount: number;

  @ApiProperty({ description: "个人公积金", example: 1200 })
  hfPersonalAmount: number;

  @ApiProperty({ description: "其他扣款（缺勤等，不含个税抵扣）", example: 200 })
  otherDeductionAmount: number;

  @ApiProperty({ description: "专项附加扣除", example: 2000 })
  specialDeductionMonthly: number;

  @ApiProperty({ description: "个人所得税", example: 320.45 })
  personalIncomeTax: number;

  @ApiProperty({
    description: "年终奖计税方式",
    enum: YearEndTaxModeEnum,
    example: YearEndTaxModeEnum.SEPARATE,
    nullable: true
  })
  yearEndTaxMode: YearEndTaxMode | null;

  @ApiProperty({ description: "年终奖", example: 20000 })
  yearEndBonus: number;

  @ApiProperty({ description: "税后工资", example: 12279.55 })
  postTaxMonthly: number;

  @ApiPropertyOptional({ description: "反推申报应发（确认后有值）", example: 12000, nullable: true })
  inferredPreTax: number | null;

  @ApiPropertyOptional({
    description: "申报偏差 under/over",
    enum: SalaryReportBiasEnum,
    nullable: true
  })
  reportBias: SalaryReportBias | null;

  @ApiProperty({ description: "是否用反推应发参与后续累计", example: false })
  useInferredForCumulative: boolean;

  @ApiProperty({ description: "更新时间", example: "2026-07-20T08:00:00.000Z" })
  updateTime: Date;
}

/** 软删单条历史 */
export class DeleteSalaryVerifyHistoryDto {
  @ApiProperty({ description: "历史记录ID", example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  id: number;
}

/** 历史详情：单条；核对时附带同年核对列表（供累计预扣） */
export class SalaryHistoryDetailDto {
  @ApiProperty({ description: "当前历史记录", type: SalaryVerifyHistoryItemDto })
  item: SalaryVerifyHistoryItemDto;

  @ApiPropertyOptional({
    description: "仅 verify 返回：同年全部核对记录（含当前）；calc 不返回此字段",
    type: [SalaryVerifyHistoryItemDto]
  })
  relatedVerifyList?: SalaryVerifyHistoryItemDto[];
}

/** 历史列表查询：可选 keyword / historyType */
export class ListSalaryVerifyHistoryDto {
  @ApiPropertyOptional({ description: "搜索关键词（支持年月、税前工资）", example: "2026-06" })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: "历史类型过滤：verify 月薪核对，calc 年薪测算",
    enum: SalaryHistoryTypeEnum,
    example: SalaryHistoryTypeEnum.CALC
  })
  @IsOptional()
  @IsEnum(SalaryHistoryTypeEnum)
  historyType?: SalaryHistoryType;
}
