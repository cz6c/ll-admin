import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PushTaskService } from './pushtask.service';
import { CreatePushTaskDto, UpdatePushTaskDto, ListPushTaskDto, ListPushLogDto, PushTaskVO, PushLogVO, ChangeStatusDto } from './dto/index';
import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';

@ApiTags('邮箱推送任务管理')
@ApiBearerAuth()
@Controller('nodemailer')
export class PushTaskController {
  constructor(private readonly pushTaskService: PushTaskService) {}

  @ApiOperation({ summary: '邮箱推送任务-创建' })
  @ApiBody({ type: CreatePushTaskDto })
  @ApiResult()
  @Post('/')
  create(@Body() createPushTaskDto: CreatePushTaskDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.pushTaskService.createPushTask(createPushTaskDto, user.userId);
  }

  @ApiOperation({ summary: '邮箱推送任务-列表' })
  @ApiResult(PushTaskVO, true, true)
  @Get('/list')
  findAll(@Query() query: ListPushTaskDto) {
    return this.pushTaskService.findAllPushTask(query);
  }

  @ApiOperation({ summary: '邮箱推送任务-详情' })
  @ApiResult(PushTaskVO)
  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.pushTaskService.findOnePushTask(+id);
  }

  @ApiOperation({ summary: '邮箱推送任务-更新' })
  @ApiBody({ type: UpdatePushTaskDto })
  @ApiResult()
  @Post('/update')
  update(@Body() updatePushTaskDto: UpdatePushTaskDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.pushTaskService.updatePushTask(updatePushTaskDto, user.userId);
  }

  @ApiOperation({ summary: '邮箱推送任务-切换状态' })
  @ApiBody({ type: ChangeStatusDto })
  @ApiResult()
  @Post('/switchStatus')
  switchStatus(@Body() data: ChangeStatusDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.pushTaskService.switchStatus(data, user.userId);
  }

  @ApiOperation({ summary: '邮箱推送任务-删除' })
  @ApiResult()
  @Get('/:ids')
  remove(@Param('ids') ids: string, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.pushTaskService.removePushTask(
      ids.split(',').map((id) => +id),
      user.userId,
    );
  }

  @ApiOperation({ summary: '邮箱推送任务-日志列表' })
  @ApiResult(PushLogVO, true, true)
  @Get('/logList')
  findAllLog(@Query() query: ListPushLogDto) {
    return this.pushTaskService.findAllPushLog(query);
  }
}
