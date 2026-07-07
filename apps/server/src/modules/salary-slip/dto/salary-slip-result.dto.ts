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

export class SalarySlipUploadDto {
  @ApiProperty({ type: "string", format: "binary" })
  file: Express.Multer.File;
}
