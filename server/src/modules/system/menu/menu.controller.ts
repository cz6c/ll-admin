import { Controller, Get, Post, Body, Query, Put, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { MenuService } from './menu.service';
import { CreateMenuDto, UpdateMenuDto, ListMenuDto, SysMenuVo, MenuTreeVo, RoleMenuTreeSelect } from './dto/index';
import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';

@ApiTags('菜单管理')
@ApiBearerAuth()
@Controller('system/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @ApiOperation({ summary: '菜单管理-创建' })
  @ApiBody({ type: CreateMenuDto })
  @ApiResult()
  @Post()
  create(@Body() createMenuDto: CreateMenuDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.menuService.create(createMenuDto, user.userId);
  }

  @ApiOperation({ summary: '菜单管理-列表' })
  @ApiResult(SysMenuVo, true)
  @Get('/list')
  findAll(@Query() query: ListMenuDto) {
    return this.menuService.findAll(query);
  }

  @ApiOperation({ summary: '菜单管理-树' })
  @ApiResult(MenuTreeVo, true)
  @Get('/treeSelect')
  treeSelect() {
    return this.menuService.treeSelect();
  }

  @ApiOperation({ summary: '菜单管理-角色-树' })
  @ApiResult(RoleMenuTreeSelect)
  @Get('/roleMenuTreeSelect/:menuId')
  roleMenuTreeSelect(@Param('menuId') menuId: string) {
    return this.menuService.roleMenuTreeSelect(+menuId);
  }

  @ApiOperation({ summary: '菜单管理-详情' })
  @ApiResult(SysMenuVo)
  @Get(':menuId')
  findOne(@Param('menuId') menuId: string) {
    return this.menuService.findOne(+menuId);
  }

  @ApiOperation({ summary: '菜单管理-修改' })
  @ApiBody({ type: UpdateMenuDto })
  @ApiResult()
  @Put()
  update(@Body() updateMenuDto: UpdateMenuDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.menuService.update(updateMenuDto, user.userId);
  }

  @ApiOperation({ summary: '菜单管理-删除' })
  @ApiResult()
  @Delete(':menuId')
  remove(@Param('menuId') menuId: string, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.menuService.remove(+menuId, user.userId);
  }
}
