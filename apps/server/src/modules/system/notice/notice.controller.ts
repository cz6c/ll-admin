import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { NoticeService } from './notice.service';
import { CreateNoticeDto, UpdateNoticeDto, ListNoticeDto, SysNoticeVO } from './dto/index';
import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';

@ApiTags('systemNotice')
@ApiBearerAuth()
@Controller('system/notice')
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  @ApiOperation({ summary: '通知公告-创建' })
  @ApiBody({ type: CreateNoticeDto })
  @ApiResult()
  @Post('/create')
  create(@Body() createConfigDto: CreateNoticeDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.noticeService.create(createConfigDto, user.userId);
  }

  @ApiOperation({ summary: '通知公告-列表' })
  @ApiBody({ type: ListNoticeDto })
  @ApiResult(SysNoticeVO, true, true)
  @Get('/list')
  findAll(@Query() query: ListNoticeDto) {
    return this.noticeService.findAll(query);
  }

  @ApiOperation({ summary: '通知公告-详情' })
  @ApiResult(SysNoticeVO)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.noticeService.findOne(+id);
  }

  @ApiOperation({ summary: '通知公告-更新' })
  @ApiBody({ type: UpdateNoticeDto })
  @ApiResult()
  @Post('/update')
  update(@Body() updateNoticeDto: UpdateNoticeDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.noticeService.update(updateNoticeDto, user.userId);
  }

  @ApiOperation({ summary: '通知公告-删除' })
  @ApiResult()
  @Get('/delete/:ids')
  remove(@Param('ids') ids: string, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.noticeService.remove(
      ids.split(',').map((id) => +id),
      user.userId,
    );
  }
}
