import { IsString, IsEnum, IsArray, Length, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { BaseVO, PagingDto } from '@/common/dto/index';
import { DataScopeEnum, StatusEnum } from '@/common/enum/dict';

export class CreateRoleDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 30)
  roleName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 100)
  roleKey: string;

  @ApiProperty({ required: true })
  @IsNumber()
  roleSort: number;

  @ApiProperty({ required: true })
  @IsArray()
  menuIds: Array<number>;

  @ApiProperty({ required: true })
  @IsArray()
  deptIds: Array<number>;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  status: StatusEnum;

  @ApiProperty({ required: true })
  @IsEnum(DataScopeEnum)
  dataScope: DataScopeEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  menuCheckStrictly?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  deptCheckStrictly?: boolean;
}

export class UpdateRoleDto extends CreateRoleDto {
  @ApiProperty({ type: Number, description: '角色ID' })
  @IsNumber()
  roleId: number;
}

export class ChangeStatusDto extends PickType(UpdateRoleDto, ['roleId', 'status'] as const) {}

export class ListRoleDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 30)
  roleName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  roleKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  roleId?: string;
}

export class SysRoleVo extends BaseVO {
  @ApiProperty({ description: '角色ID', example: 1 })
  public roleId: number;

  @ApiProperty({ description: '角色名称', example: 'Administrator' })
  public roleName: string;

  @ApiProperty({ description: '显示顺序', example: 0 })
  public roleSort: number;

  @ApiProperty({ description: '角色权限字符串', example: 'ROLE_ADMIN' })
  public roleKey: string;

  @ApiProperty({
    description: '数据范围 (1: 全部数据权限, 2: 自定数据权限, 3: 本部门数据权限, 4: 本部门及以下数据权限, 5: 仅本人数据权限)',
    enum: DataScopeEnum,
    example: DataScopeEnum.DATA_SCOPE_ALL,
  })
  public dataScope: DataScopeEnum;

  @ApiProperty({ description: '菜单树选择项是否关联显示', example: false })
  public menuCheckStrictly: boolean;

  @ApiProperty({ description: '部门树选择项是否关联显示', example: false })
  public deptCheckStrictly: boolean;

  @ApiProperty({ description: '备注', example: '这是管理员角色的备注' })
  public remark: string;
}
