import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PushTaskService } from './nodemailer.service';
import {
  CreateNodemailerPushTaskDto,
  UpdateNodemailerPushTaskDto,
  ListNodemailerPushTaskDto,
  ListNodemailerPushLogDto,
  NodemailerPushTaskVO,
  NodemailerPushLogVO,
  ChangeStatusDto,
} from './dto/index';
import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';

@ApiTags('邮箱推送任务管理')
@ApiBearerAuth()
@Controller('nodemailer')
export class NodemailerController {
  constructor(private readonly pushTaskService: PushTaskService) {}

  @ApiOperation({ summary: '邮箱推送任务-创建' })
  @ApiBody({ type: CreateNodemailerPushTaskDto })
  @ApiResult()
  @Post('/')
  create(@Body() createNodemailerPushTaskDto: CreateNodemailerPushTaskDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.pushTaskService.createPushTask(createNodemailerPushTaskDto, user.userId);
  }

  @ApiOperation({ summary: '邮箱推送任务-列表' })
  @ApiResult(NodemailerPushTaskVO, true, true)
  @Get('/list')
  findAll(@Query() query: ListNodemailerPushTaskDto) {
    return this.pushTaskService.findAllPushTask(query);
  }

  @ApiOperation({ summary: '邮箱推送任务-详情' })
  @ApiResult(NodemailerPushTaskVO)
  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.pushTaskService.findOnePushTask(+id);
  }

  @ApiOperation({ summary: '邮箱推送任务-更新' })
  @ApiBody({ type: UpdateNodemailerPushTaskDto })
  @ApiResult()
  @Post('/update')
  update(@Body() updateNodemailerPushTaskDto: UpdateNodemailerPushTaskDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.pushTaskService.updatePushTask(updateNodemailerPushTaskDto, user.userId);
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
  @ApiResult(NodemailerPushLogVO, true, true)
  @Get('/logList')
  findAllLog(@Query() query: ListNodemailerPushLogDto) {
    return this.pushTaskService.findAllPushLog(query);
  }
}
