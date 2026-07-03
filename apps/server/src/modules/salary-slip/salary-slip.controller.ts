import { Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiResult } from "@/common/decorator";
import { SalarySlipResultDto, SalarySlipUploadDto } from "./dto/salary-slip-result.dto";
import { SalarySlipService } from "./salary-slip.service";

@ApiTags("common")
@Controller("common/salary-slip")
export class SalarySlipController {
  constructor(private readonly salarySlipService: SalarySlipService) {}

  @ApiOperation({ summary: "工资条智能识别" })
  @ApiBody({ type: SalarySlipUploadDto })
  @ApiConsumes("multipart/form-data")
  @ApiResult(SalarySlipResultDto)
  @Post("recognize")
  @UseInterceptors(FileInterceptor("file"))
  recognize(@UploadedFile() file: Express.Multer.File) {
    return this.salarySlipService.recognize(file);
  }
}
