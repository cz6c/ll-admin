import { Controller, Get, Post, Body, Put, Param, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { NodemailerService } from './nodemailer.service';
import { CreateNodemailerPushTaskDto, UpdateNodemailerPushTaskDto, ListNodemailerPushTaskDto, ListNodemailerPushLogDto } from './dto/index';

@ApiTags('邮箱推送任务管理')
@Controller('nodemailer')
export class NodemailerController {
  constructor(private readonly nodemailerService: NodemailerService) {}

  @ApiOperation({
    summary: '邮箱推送任务-创建',
  })
  @ApiBody({
    type: CreateNodemailerPushTaskDto,
    required: true,
  })
  @Post('/')
  create(@Body() createNodemailerPushTaskDto: CreateNodemailerPushTaskDto) {
    return this.nodemailerService.createPushTask(createNodemailerPushTaskDto);
  }

  @ApiOperation({
    summary: '邮箱推送任务-列表',
  })
  @ApiBody({
    type: ListNodemailerPushTaskDto,
    required: true,
  })
  @Get('/list')
  findAll(@Query() query: ListNodemailerPushTaskDto) {
    return this.nodemailerService.findAllPushTask(query);
  }

  @ApiOperation({
    summary: '邮箱推送任务-详情',
  })
  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.nodemailerService.findOnePushTask(+id);
  }

  @ApiOperation({
    summary: '邮箱推送任务-更新',
  })
  @ApiBody({
    type: UpdateNodemailerPushTaskDto,
    required: true,
  })
  @Put('/')
  update(@Body() updateNodemailerPushTaskDto: UpdateNodemailerPushTaskDto) {
    return this.nodemailerService.updatePushTask(updateNodemailerPushTaskDto);
  }

  @ApiOperation({
    summary: '邮箱推送任务-删除',
  })
  @Delete('/:ids')
  remove(@Param('ids') ids: string) {
    const _ids = ids.split(',').map((id) => id);
    return this.nodemailerService.removePushTask(_ids);
  }

  @ApiOperation({
    summary: '邮箱推送任务-日志列表',
  })
  @ApiBody({
    type: ListNodemailerPushLogDto,
    required: true,
  })
  @Get('/logList')
  findAllLog(@Query() query: ListNodemailerPushLogDto) {
    return this.nodemailerService.findAllPushLog(query);
  }
}
