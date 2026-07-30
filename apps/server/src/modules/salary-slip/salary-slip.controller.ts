/**
 * 工资条识别与薪资历史 HTTP 入口
 * 薄控制器：鉴权用户态透传 Service；接口说明见各 @ApiOperation
 */
import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiResult, GetRequestUser, RequestUserPayload } from "@/common/decorator";
import { SalarySlipResultDto, SalarySlipUploadDto } from "./dto/salary-slip-result.dto";
import { ListSalaryVerifyHistoryDto, SalaryHistoryDetailDto, SalaryVerifyHistoryItemDto, UpsertSalaryVerifyHistoryDto } from "./dto/salary-verify-history.dto";
import { SalarySlipService } from "./salary-slip.service";

@ApiTags("salary-slip")
@ApiBearerAuth()
@Controller("salary-slip")
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

  @ApiOperation({ summary: "月薪核对历史-新增或更新" })
  @ApiBody({ type: UpsertSalaryVerifyHistoryDto })
  @ApiResult(SalaryVerifyHistoryItemDto)
  @Post("history/upsert")
  upsertHistory(@Body() dto: UpsertSalaryVerifyHistoryDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.salarySlipService.upsertHistory(user.userId, dto);
  }

  @ApiOperation({ summary: "月薪核对历史-列表" })
  @ApiResult(SalaryVerifyHistoryItemDto, true)
  @Get("history/list")
  listHistory(@Query() query: ListSalaryVerifyHistoryDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.salarySlipService.listHistory(user.userId, query.keyword, query.historyType);
  }

  @ApiOperation({ summary: "薪资历史-详情（verify 附带同年核对列表供累计预扣）" })
  @ApiResult(SalaryHistoryDetailDto)
  @Get("history/detail/:id")
  getHistoryDetail(@Param("id") id: string, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.salarySlipService.getHistoryDetail(user.userId, Number(id));
  }

  @ApiOperation({ summary: "月薪核对历史-删除" })
  @ApiResult()
  @Post("history/delete/:id")
  removeHistory(@Param("id") id: string, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.salarySlipService.removeHistory(user.userId, Number(id));
  }
}
