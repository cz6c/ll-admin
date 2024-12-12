import { IsString, IsEnum, Length, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BaseVO, PagingDto } from '@/common/dto/index';
import { StatusEnum } from '@/common/enum/dict';

export class CreatePostDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  postName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 64)
  postCode: string;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  status: StatusEnum;

  @ApiProperty({ required: true })
  @IsNumber()
  postSort: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}

export class UpdatePostDto extends CreatePostDto {
  @ApiProperty({ required: true })
  @IsNumber()
  postId: number;
}

export class ListPostDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  postName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 64)
  postCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsEnum(StatusEnum)
  status?: StatusEnum;
}

export class SysPostVo extends BaseVO {
  @ApiProperty({ description: '岗位ID', example: 1 })
  public postId: number;

  @ApiProperty({ description: '岗位编码', example: 'PC001' })
  public postCode: string;

  @ApiProperty({ description: '岗位名称', example: '项目经理' })
  public postName: string;

  @ApiProperty({ description: '显示顺序', example: 1 })
  public postSort: number;
}
