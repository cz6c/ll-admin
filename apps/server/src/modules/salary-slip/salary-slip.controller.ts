import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiResult, GetRequestUser, RequestUserPayload } from "@/common/decorator";
import { SalarySlipResultDto, SalarySlipUploadDto } from "./dto/salary-slip-result.dto";
import { ListSalaryVerifyHistoryDto, SalaryVerifyHistoryItemDto, UpsertSalaryVerifyHistoryDto } from "./dto/salary-verify-history.dto";
import { SalarySlipService } from "./salary-slip.service";

@ApiTags("common")
@ApiBearerAuth()
@Controller("common/salary-slip")
export class SalarySlipController {
  constructor(private readonly salarySlipService: SalarySlipService) {}

  @ApiOperation({ summary: "工资条智能识别" })
  @ApiBody({ type: SalarySlipUploadDto })
  @ApiConsumes("multipart/form-data")
  @ApiResult(SalarySlipResultDto)
  @Post("recognize")
  @UseInterceptors(FileInterceptor("file"))
  recognize(@UploadedFile() file: Express.Multer.File, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.salarySlipService.recognize(file, user.userId);
  }

  @ApiOperation({ summary: "工资核对历史-新增或更新" })
  @ApiBody({ type: UpsertSalaryVerifyHistoryDto })
  @ApiResult(SalaryVerifyHistoryItemDto)
  @Post("history/upsert")
  upsertHistory(@Body() dto: UpsertSalaryVerifyHistoryDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.salarySlipService.upsertHistory(user.userId, dto);
  }

  @ApiOperation({ summary: "工资核对历史-列表" })
  @ApiResult(SalaryVerifyHistoryItemDto, true)
  @Get("history/list")
  listHistory(@Query() query: ListSalaryVerifyHistoryDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.salarySlipService.listHistory(user.userId, query.keyword);
  }

  @ApiOperation({ summary: "工资核对历史-删除" })
  @ApiResult()
  @Post("history/delete/:id")
  removeHistory(@Param("id") id: string, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.salarySlipService.removeHistory(user.userId, Number(id));
  }
}
