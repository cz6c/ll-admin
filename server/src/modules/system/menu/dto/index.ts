import { IsString, IsEnum, Length, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MenuTypeEnum, StatusEnum } from '@/common/enum/dict';

export class CreateMenuDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  menuName: string;

  @ApiProperty({ required: true })
  @IsOptional()
  @IsNumber()
  parentId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  orderNum: number;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 200)
  path: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  component: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  activeMenu: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(StatusEnum)
  isCache?: StatusEnum;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  isFrame: StatusEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  icon: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  perm: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(MenuTypeEnum)
  menuType?: MenuTypeEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remark: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(StatusEnum)
  visible?: StatusEnum;
}

export class UpdateMenuDto extends CreateMenuDto {
  @ApiProperty({ required: true })
  @IsNumber()
  menuId: number;
}

export class ListMenuDto {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  menuName?: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsNumber()
  parentId?: number;
}
