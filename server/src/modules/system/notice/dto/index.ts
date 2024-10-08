import { IsString, IsEnum, Length, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PagingDto } from '@/common/dto/index';
import { StatusEnum } from '@/common/enum';

export enum TypeEnum {
  Instruct = '1',
  Notice = '2',
}
export class CreateNoticeDto {
  @IsString()
  @Length(0, 50)
  noticeTitle: string;

  @IsString()
  @IsEnum(TypeEnum)
  noticeType: string;

  @ApiProperty({
    required: true,
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  noticeContent: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsEnum(StatusEnum)
  status?: string;
}

export class UpdateNoticeDto extends CreateNoticeDto {
  @IsNumber()
  noticeId: number;
}

export class ListNoticeDto extends PagingDto {
  @IsOptional()
  @IsString()
  @Length(0, 50)
  noticeTitle?: string;

  @IsOptional()
  @IsString()
  @IsEnum(TypeEnum)
  noticeType?: string;

  @IsOptional()
  @IsString()
  createBy?: string;
}
