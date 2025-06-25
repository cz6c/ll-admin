import { Controller, Get, Post, Body, Param, Res, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PostService } from './post.service';
import { CreatePostDto, UpdatePostDto, ListPostDto, SysPostVo } from './dto/index';
import { Response } from 'express';
import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';

@ApiTags('岗位管理')
@ApiBearerAuth()
@Controller('system/post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @ApiOperation({ summary: '岗位管理-创建' })
  @ApiBody({ type: CreatePostDto })
  @ApiResult()
  @Post('/create')
  create(@Body() createPostDto: CreatePostDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.postService.create(createPostDto, user.userId);
  }

  @ApiOperation({ summary: '岗位管理-列表' })
  @ApiResult(SysPostVo, true, true)
  @Get('/list')
  findAll(@Query() query: ListPostDto) {
    return this.postService.findAll(query);
  }

  @ApiOperation({ summary: '岗位管理-详情' })
  @ApiResult(SysPostVo)
  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.postService.findOne(+id);
  }

  @ApiOperation({ summary: '岗位管理-更新' })
  @ApiBody({ type: UpdatePostDto })
  @ApiResult()
  @Post('/update')
  update(@Body() updatePostDto: UpdatePostDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.postService.update(updatePostDto, user.userId);
  }

  @ApiOperation({ summary: '岗位管理-删除' })
  @ApiResult()
  @Get('/delete/:ids')
  remove(@Param('ids') ids: string, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.postService.remove(
      ids.split(',').map((id) => +id),
      user.userId,
    );
  }

  @ApiOperation({ summary: '导出岗位管理xlsx文件' })
  @Post('/export')
  async export(@Res() res: Response, @Body() body: ListPostDto): Promise<void> {
    return this.postService.export(res, body);
  }
}
