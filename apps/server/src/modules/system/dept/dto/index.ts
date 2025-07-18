import { IsString, IsEnum, Min, Length, IsOptional, IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { StatusEnum } from "@/common/enum/dict";
import { BaseVO } from "@/common/dto";

export class CreateDeptDto {
  @ApiProperty({ required: true })
  @IsNumber()
  parentId: number;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 30)
  deptName: string;

  @ApiProperty({ required: true })
  @IsNumber()
  @Min(0)
  orderNum: number;

  @ApiProperty({ required: true })
  @IsString()
  leader: string;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  status: StatusEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 11)
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  email?: string;
}

export class UpdateDeptDto extends CreateDeptDto {
  @ApiProperty({ required: true })
  @IsNumber()
  deptId: number;
}

export class ListDeptDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deptName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: string;
}

export class SysDeptVo extends BaseVO {
  @ApiProperty({ description: "部门ID", example: 1 })
  public deptId?: number;

  @ApiProperty({ description: "父部门ID", example: 0 })
  public parentId: number;

  @ApiProperty({ description: "祖级列表（表示层级关系）", example: "0,1,2" })
  public ancestors: string;

  @ApiProperty({ description: "部门名称", example: "人力资源部" })
  public deptName: string;

  @ApiProperty({ description: "显示顺序", example: 1 })
  public orderNum: number;

  @ApiProperty({ description: "负责人", example: "张三" })
  public leader: string;

  @ApiProperty({ description: "联系电话", example: "13800138000" })
  public phone: string;

  @ApiProperty({ description: "邮箱", example: "zhangsan@example.com" })
  public email: string;
}

export class DeptTreeVo extends SysDeptVo {
  @ApiProperty({ description: "子级列表", example: [] })
  children: DeptTreeVo[];
}

export class RoleDeptTreeSelectVo {
  @ApiProperty({ description: "部门树", example: [] })
  depts: DeptTreeVo[];

  @ApiProperty({ description: "角色已绑定部门ids", example: [] })
  checkedIds: number[];
}
