/**
 * 工资条识别接口 DTO（上传 + 识别结果）
 */
import { ApiProperty } from "@nestjs/swagger";

export class LineItemDto {
  @ApiProperty({ description: "项目名称" })
  key: string;

  @ApiProperty({ description: "金额（已格式化，空值为 -）" })
  value: string;

  @ApiProperty({ description: "对齐置信度 0~1" })
  confidence: number;

  @ApiProperty({ description: "单项核对提示，无则为空字符串" })
  warning: string;
}

export class SalarySlipResultDto {
  @ApiProperty({ type: [LineItemDto], required: false, description: "识别明细项，供核对" })
  line_items?: LineItemDto[];

  @ApiProperty({ enum: ["high", "medium", "low"], required: false, description: "识别置信度" })
  confidence?: "high" | "medium" | "low";
}

/** multipart 上传体；字段名必须为 file（与 FileInterceptor("file") 一致） */
export class SalarySlipUploadDto {
  @ApiProperty({ type: "string", format: "binary", description: "工资条图片，字段名 file" })
  file: Express.Multer.File;
}
