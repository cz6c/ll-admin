import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from "class-validator";

export class UpsertSalaryVerifyHistoryDto {
  @ApiProperty({ description: "工资所属月份，格式 YYYY-MM", example: "2026-06" })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "payPeriod 格式应为 YYYY-MM" })
  payPeriod: string;

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

  @ApiPropertyOptional({ description: "专项附加扣除", example: 2000 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  specialDeductionMonthly?: number;

  @ApiProperty({ description: "个人所得税", example: 320.45 })
  @Type(() => Number)
  @IsNumber()
  personalIncomeTax: number;

  @ApiProperty({ description: "税后工资", example: 12279.55 })
  @Type(() => Number)
  @IsNumber()
  postTaxMonthly: number;

  @ApiPropertyOptional({ description: "保存时间戳（毫秒）", example: 1762740669502 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  savedAt?: number;
}

export class SalaryVerifyHistoryItemDto {
  @ApiProperty({ description: "历史记录ID", example: 1 })
  id: number;

  @ApiProperty({ description: "工资所属月份，格式 YYYY-MM", example: "2026-06" })
  payPeriod: string;

  @ApiProperty({ description: "税前工资", example: 15000 })
  preTaxMonthly: number;

  @ApiProperty({ description: "个人社保", example: 1200 })
  ssPersonalAmount: number;

  @ApiProperty({ description: "个人公积金", example: 1200 })
  hfPersonalAmount: number;

  @ApiProperty({ description: "专项附加扣除", example: 2000 })
  specialDeductionMonthly: number;

  @ApiProperty({ description: "个人所得税", example: 320.45 })
  personalIncomeTax: number;

  @ApiProperty({ description: "税后工资", example: 12279.55 })
  postTaxMonthly: number;

  @ApiProperty({ description: "保存时间戳（毫秒）", example: 1762740669502 })
  savedAt: number;
}

export class DeleteSalaryVerifyHistoryDto {
  @ApiProperty({ description: "历史记录ID", example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  id: number;
}

export class ListSalaryVerifyHistoryDto {
  @ApiPropertyOptional({ description: "搜索关键词（支持年月、税前工资）", example: "2026-06" })
  @IsOptional()
  @IsString()
  keyword?: string;
}
