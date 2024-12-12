import { Controller, Get, Post, Body, Put, Param, Delete, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { CreateConfigDto, UpdateConfigDto, ListConfigDto, SysConfigVo } from './dto/index';
import { ApiResult } from '@/common/decorator';

@ApiTags('参数设置')
@ApiBearerAuth()
@Controller('system/config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @ApiOperation({ summary: '参数设置-创建' })
  @ApiBody({ type: CreateConfigDto })
  @ApiResult()
  @Post()
  create(@Body() createConfigDto: CreateConfigDto) {
    return this.configService.create(createConfigDto);
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
  @Put()
  update(@Body() updateConfigDto: UpdateConfigDto) {
    return this.configService.update(updateConfigDto);
  }

  @ApiOperation({ summary: '参数设置-删除' })
  @ApiResult()
  @Delete(':id')
  remove(@Param('id') ids: string) {
    const configIds = ids.split(',').map((id) => +id);
    return this.configService.remove(configIds);
  }

  @ApiOperation({ summary: '导出参数管理为xlsx文件' })
  @Post('/export')
  async export(@Res() res: Response, @Body() body: ListConfigDto): Promise<void> {
    return this.configService.export(res, body);
  }
}
