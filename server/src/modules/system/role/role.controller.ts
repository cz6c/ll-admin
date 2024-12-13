import { Controller, Get, Post, Body, Put, Param, Query, Delete, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { RoleService } from './role.service';
import { Response } from 'express';
import { CreateRoleDto, UpdateRoleDto, ListRoleDto, ChangeStatusDto, SysRoleVo } from './dto/index';

import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';
@ApiTags('角色管理')
@ApiBearerAuth()
@Controller('system/role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @ApiOperation({ summary: '角色管理-创建' })
  @ApiBody({ type: CreateRoleDto })
  @ApiResult()
  @Post()
  create(@Body() createRoleDto: CreateRoleDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.roleService.create(createRoleDto, user.userId);
  }

  @ApiOperation({ summary: '角色管理-列表' })
  @ApiResult(SysRoleVo, true, true)
  @Get('list')
  findAll(@Query() query: ListRoleDto) {
    return this.roleService.findAll(query);
  }

  @ApiOperation({ summary: '角色管理-详情' })
  @ApiResult(SysRoleVo)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roleService.findOne(+id);
  }

  @ApiOperation({ summary: '角色管理-修改' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResult()
  @Put()
  update(@Body() updateRoleDto: UpdateRoleDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.roleService.update(updateRoleDto, user.userId);
  }

  @ApiOperation({ summary: '角色管理-切换状态' })
  @ApiBody({ type: ChangeStatusDto })
  @ApiResult()
  @Put('changeStatus')
  changeStatus(@Body() changeStatusDto: ChangeStatusDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.roleService.changeStatus(changeStatusDto, user.userId);
  }

  @ApiOperation({ summary: '角色管理-删除' })
  @ApiResult()
  @Delete(':id')
  remove(@Param('id') ids: string, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.roleService.remove(
      ids.split(',').map((id) => +id),
      user.userId,
    );
  }

  @ApiOperation({ summary: '导出角色管理xlsx文件' })
  @Post('/export')
  async export(@Res() res: Response, @Body() body: ListRoleDto): Promise<void> {
    return this.roleService.export(res, body);
  }
}
