import { IsString, IsEnum, Length, IsOptional, IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { BaseVO, PagingDto } from "@/common/dto/index";
import { NoticeTypeEnum, StatusEnum } from "@/common/enum/dict";

export class CreateNoticeDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  noticeTitle: string;

  @ApiProperty({ required: true })
  @IsEnum(NoticeTypeEnum)
  noticeType: NoticeTypeEnum;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 500)
  noticeContent: string;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  status: StatusEnum;
}

export class UpdateNoticeDto extends CreateNoticeDto {
  @ApiProperty({ required: true })
  @IsNumber()
  noticeId: number;
}

export class ListNoticeDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  noticeTitle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(NoticeTypeEnum)
  noticeType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  createBy?: number;
}

export class SysNoticeVO extends BaseVO {
  @ApiProperty({ description: "公告ID", example: 1 })
  public noticeId: number;

  @ApiProperty({ description: "公告标题", example: "系统维护通知" })
  public noticeTitle: string;

  @ApiProperty({
    description: "公告类型（1为通知，2为公告）",
    enum: NoticeTypeEnum,
    example: NoticeTypeEnum.Instruct
  })
  public noticeType: NoticeTypeEnum;

  @ApiProperty({
    description: "公告内容",
    example: "系统将于今晚进行维护，请提前保存工作。"
  })
  public noticeContent: string;
}
