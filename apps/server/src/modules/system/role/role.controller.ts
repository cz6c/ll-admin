import { Controller, Get, Post, Body, Param, Query, Res } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import { RoleService } from "./role.service";
import type { Response as ExpressResponse } from "express";
import { CreateRoleDto, UpdateRoleDto, ListRoleDto, RoleChangeStatusDto, SysRoleVo } from "./dto/index";

import { ApiResult, GetRequestUser, RequestUserPayload } from "@/common/decorator";
@ApiTags("systemRole")
@ApiBearerAuth()
@Controller("system/role")
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @ApiOperation({ summary: "角色管理-创建" })
  @ApiBody({ type: CreateRoleDto })
  @ApiResult()
  @Post("/create")
  create(@Body() createRoleDto: CreateRoleDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.roleService.create(createRoleDto, user.userId);
  }

  @ApiOperation({ summary: "角色管理-列表" })
  @ApiResult(SysRoleVo, true, true)
  @Get("list")
  findAll(@Query() query: ListRoleDto) {
    return this.roleService.findAll(query);
  }

  @ApiOperation({ summary: "角色管理-详情" })
  @ApiResult(SysRoleVo)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.roleService.findOne(+id);
  }

  @ApiOperation({ summary: "角色管理-修改" })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResult()
  @Post("/update")
  update(@Body() updateRoleDto: UpdateRoleDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.roleService.update(updateRoleDto, user.userId);
  }

  @ApiOperation({ summary: "角色管理-切换状态" })
  @ApiBody({ type: RoleChangeStatusDto })
  @ApiResult()
  @Post("/changeStatus")
  changeStatus(@Body() RoleChangeStatusDto: RoleChangeStatusDto, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.roleService.changeStatus(RoleChangeStatusDto, user.userId);
  }

  @ApiOperation({ summary: "角色管理-删除" })
  @ApiResult()
  @Get("/delete/:ids")
  remove(@Param("ids") ids: string, @GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.roleService.remove(
      ids.split(",").map(id => +id),
      user.userId
    );
  }

  @ApiOperation({ summary: "导出角色管理xlsx文件" })
  @Post("/export")
  async export(@Res() res: ExpressResponse, @Body() body: ListRoleDto): Promise<void> {
    return this.roleService.export(res, body);
  }
}
