import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { DeptService } from './dept.service';
import { CreateDeptDto, UpdateDeptDto, ListDeptDto, SysDeptVo, RoleDeptTreeSelectVo, DeptTreeVo } from './dto/index';
import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';

@ApiTags('部门管理')
@ApiBearerAuth()
@Controller('system/dept')
export class DeptController {
  constructor(private readonly deptService: DeptService) {}

  @ApiOperation({ summary: '部门管理-创建' })
  @ApiBody({ type: CreateDeptDto })
  @ApiResult()
  @Post('/create')
  create(@Body() createDeptDto: CreateDeptDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.deptService.create(createDeptDto, user.userId);
  }

  // @ApiOperation({ summary: '部门管理-列表' })
  // @ApiResult(SysDeptVo, true)
  // @Get('/list')
  // findAll(@Query() query: ListDeptDto) {
  //   return this.deptService.findAll(query);
  // }

  @ApiOperation({ summary: '部门管理-树' })
  @ApiResult(DeptTreeVo, true)
  @Get('/treeSelect')
  treeSelect(@Query() query: ListDeptDto) {
    return this.deptService.treeSelect(query);
  }

  @ApiOperation({ summary: '部门管理-角色部门树' })
  @ApiResult(RoleDeptTreeSelectVo)
  @Get('roleDeptTreeSelect/:id')
  roleDeptTreeSelect(@Param('id') id: string) {
    return this.deptService.roleDeptTreeSelect(+id);
  }

  @ApiOperation({ summary: '部门管理-详情' })
  @ApiResult(SysDeptVo)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deptService.findOne(+id);
  }

  @ApiOperation({ summary: '部门管理-更新' })
  @ApiBody({ type: UpdateDeptDto })
  @ApiResult()
  @Post('/update')
  update(@Body() updateDeptDto: UpdateDeptDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.deptService.update(updateDeptDto, user.userId);
  }

  @ApiOperation({ summary: '部门管理-删除' })
  @ApiResult()
  @Get('/delete/:id')
  remove(@Param('id') id: string, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.deptService.remove(+id, user.userId);
  }
}
