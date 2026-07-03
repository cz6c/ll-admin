import { ApiProperty } from "@nestjs/swagger";

export class SalarySlipResultDto {
  @ApiProperty({ type: Object, required: false, description: "识别明细项，供核对" })
  line_items?: Record<string, number | null>;
}

export class SalarySlipUploadDto {
  @ApiProperty({ type: "string", format: "binary" })
  file: Express.Multer.File;
}
