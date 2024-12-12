import { Controller, Get, Post, Body, Put, Param, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { NodemailerService } from './nodemailer.service';
import {
  CreateNodemailerPushTaskDto,
  UpdateNodemailerPushTaskDto,
  ListNodemailerPushTaskDto,
  ListNodemailerPushLogDto,
  NodemailerPushTaskVO,
  NodemailerPushLogVO,
  ChangeStatusDto,
} from './dto/index';
import { ApiResult } from '@/common/decorator';

@ApiTags('邮箱推送任务管理')
@ApiBearerAuth()
@Controller('nodemailer')
export class NodemailerController {
  constructor(private readonly nodemailerService: NodemailerService) {}

  @ApiOperation({ summary: '邮箱推送任务-创建' })
  @ApiBody({ type: CreateNodemailerPushTaskDto })
  @ApiResult()
  @Post('/')
  create(@Body() createNodemailerPushTaskDto: CreateNodemailerPushTaskDto) {
    return this.nodemailerService.createPushTask(createNodemailerPushTaskDto);
  }

  @ApiOperation({ summary: '邮箱推送任务-列表' })
  @ApiResult(NodemailerPushTaskVO, true, true)
  @Get('/list')
  findAll(@Query() query: ListNodemailerPushTaskDto) {
    return this.nodemailerService.findAllPushTask(query);
  }

  @ApiOperation({ summary: '邮箱推送任务-详情' })
  @ApiResult(NodemailerPushTaskVO)
  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.nodemailerService.findOnePushTask(+id);
  }

  @ApiOperation({ summary: '邮箱推送任务-更新' })
  @ApiBody({ type: UpdateNodemailerPushTaskDto })
  @ApiResult()
  @Put('/')
  update(@Body() updateNodemailerPushTaskDto: UpdateNodemailerPushTaskDto) {
    return this.nodemailerService.updatePushTask(updateNodemailerPushTaskDto);
  }

  @ApiOperation({ summary: '邮箱推送任务-切换状态' })
  @ApiBody({ type: ChangeStatusDto })
  @ApiResult()
  @Put('/switchStatus')
  switchStatus(@Body() data: ChangeStatusDto) {
    return this.nodemailerService.switchStatus(data);
  }

  @ApiOperation({ summary: '邮箱推送任务-删除' })
  @ApiResult()
  @Delete('/:ids')
  remove(@Param('ids') ids: string) {
    const _ids = ids.split(',').map((id) => +id);
    return this.nodemailerService.removePushTask(_ids);
  }

  @ApiOperation({ summary: '邮箱推送任务-日志列表' })
  @ApiResult(NodemailerPushLogVO, true, true)
  @Get('/logList')
  findAllLog(@Query() query: ListNodemailerPushLogDto) {
    return this.nodemailerService.findAllPushLog(query);
  }
}
