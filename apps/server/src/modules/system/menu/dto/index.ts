import { IsString, IsEnum, Length, IsOptional, IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { MenuTypeEnum, StatusEnum, YesNoEnum } from "@/common/enum/dict";
import { BaseVO } from "@/common/dto";

export class CreateMenuDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  menuName: string;

  @ApiProperty({ required: true })
  @IsNumber()
  parentId: number;

  @ApiProperty({ required: true })
  @IsNumber()
  orderNum: number;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 200)
  path: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 255)
  component: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @Length(0, 200)
  activeMenu: string;

  @ApiProperty({ required: true })
  @IsEnum(YesNoEnum)
  isCache: YesNoEnum;

  @ApiProperty({ required: true })
  @IsEnum(YesNoEnum)
  isFrame: YesNoEnum;

  @ApiProperty({ required: true })
  @IsString()
  perm: string;

  @ApiProperty({ required: true })
  @IsEnum(MenuTypeEnum)
  menuType: MenuTypeEnum;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  status: StatusEnum;

  @ApiProperty({ required: true })
  @IsEnum(YesNoEnum)
  visible: YesNoEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  icon?: string;
}

export class UpdateMenuDto extends CreateMenuDto {
  @ApiProperty({ required: true })
  @IsNumber()
  menuId: number;
}

export class ListMenuDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  menuName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;
}

export class SysMenuVo extends BaseVO {
  @ApiProperty({ description: "菜单ID" })
  public menuId: number;

  @ApiProperty({ description: "菜单名称" })
  public menuName: string;

  @ApiProperty({ description: "父菜单ID" })
  public parentId: number;

  @ApiProperty({ description: "祖级列表（表示层级关系）", example: "0,1,2" })
  public ancestors: string;

  @ApiProperty({ description: "显示顺序" })
  public orderNum: number;

  @ApiProperty({ description: "路由地址" })
  public path: string;

  @ApiProperty({ description: "组件路径" })
  public component: string;

  @ApiProperty({ description: "组件name" })
  public name: string;

  @ApiProperty({ description: "高亮菜单" })
  public activeMenu: string;

  @ApiProperty({
    description: "是否为外链",
    enum: YesNoEnum
  })
  public isFrame: YesNoEnum.NO;

  @ApiProperty({
    description: "是否缓存",
    enum: YesNoEnum
  })
  public isCache: YesNoEnum.YES;

  @ApiProperty({
    description: "是否显示",
    enum: YesNoEnum
  })
  public visible: YesNoEnum.YES;

  @ApiProperty({ description: "菜单图标" })
  public icon: string;

  @ApiProperty({ description: "功能权限标识" })
  public perm: string;

  @ApiProperty({
    description: "菜单类型（M菜单 F按钮）",
    enum: MenuTypeEnum
  })
  public menuType: MenuTypeEnum.M;
}

export class MenuTreeVo extends SysMenuVo {
  @ApiProperty({ description: "子级列表", example: [] })
  children: MenuTreeVo[];
}

export class RoleMenuTreeSelect {
  @ApiProperty({ description: "菜单树", example: [] })
  menus: MenuTreeVo[];

  @ApiProperty({ description: "角色已绑定菜单ids", example: [] })
  checkedIds: number[];
}
