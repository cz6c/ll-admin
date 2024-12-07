import { IsString, IsEnum, IsArray, Length, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PagingDto } from '@/common/dto/index';
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

  @IsOptional()
  @IsArray()
  menuIds?: Array<number>;

  @IsOptional()
  @IsArray()
  deptIds?: Array<number>;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsNumber()
  roleSort?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsEnum(DataScopeEnum)
  dataScope?: DataScopeEnum;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;

  @IsOptional()
  @IsBoolean()
  menuCheckStrictly?: boolean;

  @IsOptional()
  @IsBoolean()
  deptCheckStrictly?: boolean;
}

export class UpdateRoleDto extends CreateRoleDto {
  @ApiProperty({
    required: true,
  })
  @IsNumber()
  roleId: number;
}

export class ChangeStatusDto {
  @ApiProperty({
    required: true,
  })
  @IsNumber()
  roleId: number;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  status: StatusEnum;
}

export class ListRoleDto extends PagingDto {
  @IsOptional()
  @IsString()
  @Length(0, 30)
  roleName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  roleKey?: string;

  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  roleId?: string;
}

export class AuthUserCancelDto {
  @ApiProperty({
    required: true,
  })
  @IsNumber()
  roleId: number;

  @ApiProperty({
    required: true,
  })
  @IsNumber()
  userId: number;
}

export class AuthUserCancelAllDto {
  @ApiProperty({
    required: true,
  })
  @IsNumber()
  roleId: number;

  @ApiProperty({
    required: true,
  })
  @IsString()
  userIds: string;
}

export class AuthUserSelectAllDto {
  @ApiProperty({
    required: true,
  })
  @IsNumber()
  roleId: number;

  @ApiProperty({
    required: true,
  })
  @IsString()
  userIds: string;
}
