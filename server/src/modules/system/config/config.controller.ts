import { Controller, Get, Post, Body, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { CreateConfigDto, UpdateConfigDto, ListConfigDto, SysConfigVo } from './dto/index';
import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';

@ApiTags('参数设置')
@ApiBearerAuth()
@Controller('system/config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @ApiOperation({ summary: '参数设置-创建' })
  @ApiBody({ type: CreateConfigDto })
  @ApiResult()
  @Post('/create')
  create(@Body() createConfigDto: CreateConfigDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.configService.create(createConfigDto, user.userId);
  }

  @ApiOperation({ summary: '参数设置-列表' })
  @ApiBody({ type: ListConfigDto })
  @ApiResult(SysConfigVo, true, true)
  @Get('/list')
  findAll(@Query() query: ListConfigDto) {
    return this.configService.findAll(query);
  }

  @ApiOperation({ summary: '参数设置-详情(id)' })
  @ApiResult(SysConfigVo)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.configService.findOne(+id);
  }

  @ApiOperation({ summary: '参数设置-更新' })
  @ApiBody({ type: UpdateConfigDto })
  @ApiResult()
  @Post('/update')
  update(@Body() updateConfigDto: UpdateConfigDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.configService.update(updateConfigDto, user.userId);
  }

  @ApiOperation({ summary: '参数设置-删除' })
  @ApiResult()
  @Get('/delete/:id')
  remove(@Param('id') ids: string, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.configService.remove(
      ids.split(',').map((id) => +id),
      user.userId,
    );
  }

  @ApiOperation({ summary: '导出参数管理为xlsx文件' })
  @Post('/export')
  async export(@Res() res: Response, @Body() body: ListConfigDto): Promise<void> {
    return this.configService.export(res, body);
  }
}
