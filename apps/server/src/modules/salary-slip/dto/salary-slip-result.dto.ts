import { ApiProperty } from "@nestjs/swagger";

export class SalarySlipResultDto {
  @ApiProperty({ type: Object, required: false, description: "识别明细项，供核对" })
  line_items?: Record<string, number | null>;

  @ApiProperty({ type: [String], required: false, description: "需人工核对的提示" })
  warnings?: string[];

  @ApiProperty({ enum: ["high", "medium", "low"], required: false, description: "识别置信度" })
  confidence?: "high" | "medium" | "low";
}

export class SalarySlipUploadDto {
  @ApiProperty({ type: "string", format: "binary" })
  file: Express.Multer.File;
}
