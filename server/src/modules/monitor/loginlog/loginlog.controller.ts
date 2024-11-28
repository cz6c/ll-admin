import { Controller, Get, Post, Body, Res, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { LoginlogService } from './loginlog.service';
import { ListLoginlogDto } from './dto/index';

@ApiTags('登录日志')
@Controller('monitor/logininfor')
export class LoginlogController {
  constructor(private readonly loginlogService: LoginlogService) {}
  @ApiOperation({
    summary: '登录日志-列表',
  })
  @ApiBody({
    type: ListLoginlogDto,
    required: true,
  })
  @Get('/list')
  findAll(@Query() query: ListLoginlogDto) {
    return this.loginlogService.findAll(query);
  }

  @ApiOperation({ summary: '导出登录日志为xlsx文件' })
  @Post('/export')
  async export(@Res() res: Response, @Body() body: ListLoginlogDto): Promise<void> {
    return this.loginlogService.export(res, body);
  }
}
