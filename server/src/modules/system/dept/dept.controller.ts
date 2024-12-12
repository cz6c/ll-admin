import { Controller, Get, Post, Body, Put, Param, Query, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { DeptService } from './dept.service';
import { CreateDeptDto, UpdateDeptDto, ListDeptDto, SysDeptVo, RoleDeptTreeSelectVo, DeptTreeVo } from './dto/index';
import { ApiResult } from '@/common/decorator';

@ApiTags('部门管理')
@ApiBearerAuth()
@Controller('system/dept')
export class DeptController {
  constructor(private readonly deptService: DeptService) {}

  @ApiOperation({ summary: '部门管理-创建' })
  @ApiBody({ type: CreateDeptDto })
  @ApiResult()
  @Post()
  create(@Body() createDeptDto: CreateDeptDto) {
    return this.deptService.create(createDeptDto);
  }

  @ApiOperation({ summary: '部门管理-列表' })
  @ApiResult(SysDeptVo, true)
  @Get('/list')
  findAll(@Query() query: ListDeptDto) {
    return this.deptService.findAll(query);
  }

  @ApiOperation({ summary: '部门管理-树' })
  @ApiResult(DeptTreeVo, true)
  @Get('/treeSelect')
  treeSelect() {
    return this.deptService.treeSelect();
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

  @ApiOperation({ summary: '部门管理-修改部门下拉列表' })
  @ApiResult(SysDeptVo, true)
  @Get('/list/exclude/:id')
  findListExclude(@Param('id') id: string) {
    return this.deptService.findListExclude(+id);
  }

  @ApiOperation({ summary: '部门管理-更新' })
  @ApiBody({ type: UpdateDeptDto })
  @ApiResult()
  @Put()
  update(@Body() updateDeptDto: UpdateDeptDto) {
    return this.deptService.update(updateDeptDto);
  }

  @ApiOperation({ summary: '部门管理-删除' })
  @ApiResult()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.deptService.remove(+id);
  }
}
