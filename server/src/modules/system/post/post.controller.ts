import { Controller, Get, Post, Body, Put, Param, Delete, Res, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { PostService } from './post.service';
import { CreatePostDto, UpdatePostDto, ListPostDto } from './dto/index';
import { Response } from 'express';

@ApiTags('岗位管理')
@Controller('system/post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @ApiOperation({
    summary: '岗位管理-创建',
  })
  @ApiBody({
    type: CreatePostDto,
    required: true,
  })
  @Post('/')
  create(@Body() createPostDto: CreatePostDto) {
    return this.postService.create(createPostDto);
  }

  @ApiOperation({
    summary: '岗位管理-列表',
  })
  @ApiBody({
    type: ListPostDto,
    required: true,
  })
  @Get('/list')
  findAll(@Query() query: ListPostDto) {
    return this.postService.findAll(query);
  }

  @ApiOperation({
    summary: '岗位管理-详情',
  })
  @Get('/:id')
  findOne(@Param('id') id: string) {
    return this.postService.findOne(+id);
  }

  @ApiOperation({
    summary: '岗位管理-更新',
  })
  @ApiBody({
    type: UpdatePostDto,
    required: true,
  })
  @Put('/')
  update(@Body() updatePostDto: UpdatePostDto) {
    return this.postService.update(updatePostDto);
  }

  @ApiOperation({
    summary: '岗位管理-删除',
  })
  @Delete('/:ids')
  remove(@Param('ids') ids: string) {
    const menuIds = ids.split(',').map((id) => id);
    return this.postService.remove(menuIds);
  }

  @ApiOperation({ summary: '导出岗位管理xlsx文件' })
  @Post('/export')
  async export(@Res() res: Response, @Body() body: ListPostDto): Promise<void> {
    return this.postService.export(res, body);
  }
}
