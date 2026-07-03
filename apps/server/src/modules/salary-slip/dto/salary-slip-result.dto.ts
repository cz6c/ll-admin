import { ApiProperty } from "@nestjs/swagger";

export type SalarySlipConfidence = "high" | "medium" | "low";

export class SalarySlipResultDto {
  @ApiProperty({ type: String, nullable: true, description: "员工姓名" })
  name: string | null;

  @ApiProperty({ type: Number, nullable: true, description: "固定薪资" })
  fixed_salary: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "福利奖金" })
  welfare_bonus: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "应发工资" })
  gross_pay: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "扣款总额" })
  total_deductions: number | null;

  @ApiProperty({ type: Number, nullable: true, description: "实发工资" })
  net_pay: number | null;

  @ApiProperty({ type: String, nullable: true, description: "发薪日期 YYYY-MM-DD" })
  pay_date: string | null;

  @ApiProperty({ type: Object, required: false, description: "识别明细项，供核对" })
  line_items?: Record<string, number | null>;

  @ApiProperty({ type: String, required: false, description: "匹配到的模板 ID" })
  template_id?: string;

  @ApiProperty({ enum: ["high", "medium", "low"], required: false, description: "识别置信度" })
  confidence?: SalarySlipConfidence;

  @ApiProperty({ type: [String], required: false, description: "一致性告警" })
  warnings?: string[];
}

export class SalarySlipUploadDto {
  @ApiProperty({ type: "string", format: "binary" })
  file: Express.Multer.File;
}
