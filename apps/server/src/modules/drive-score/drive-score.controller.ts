/**
 * 试驾体验打分 HTTP 入口
 * 薄控制器：鉴权用户态透传 Service；仅本人记录可读写
 */
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiResult, GetRequestUser, RequestUserPayload } from "@/common/decorator";
import { CreateDriveScoreDto, DriveScoreItemDto, UpdateDriveScoreDto } from "./dto/drive-score.dto";
import { DriveScoreService } from "./drive-score.service";

@ApiTags("drive-score")
@ApiBearerAuth()
@Controller("drive-score")
export class DriveScoreController {
  constructor(private readonly driveScoreService: DriveScoreService) {}

  @ApiOperation({ summary: "试驾打分-我的列表" })
  @ApiResult(DriveScoreItemDto, true)
  @Get("list")
  list(@GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.driveScoreService.list(user.userId);
  }

  @ApiOperation({ summary: "试驾打分-详情" })
  @ApiResult(DriveScoreItemDto)
  @Get(":id")
  detail(@Param("id") id: string, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.driveScoreService.detail(user.userId, Number(id));
  }

  @ApiOperation({ summary: "试驾打分-创建" })
  @ApiBody({ type: CreateDriveScoreDto })
  @ApiResult(DriveScoreItemDto)
  @Post("create")
  create(@Body() dto: CreateDriveScoreDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.driveScoreService.create(user.userId, dto);
  }

  @ApiOperation({ summary: "试驾打分-更新" })
  @ApiBody({ type: UpdateDriveScoreDto })
  @ApiResult(DriveScoreItemDto)
  @Post("update")
  update(@Body() dto: UpdateDriveScoreDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.driveScoreService.update(user.userId, dto);
  }

  @ApiOperation({ summary: "试驾打分-删除" })
  @ApiResult()
  @Post("delete/:id")
  remove(@Param("id") id: string, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.driveScoreService.remove(user.userId, Number(id));
  }
}
