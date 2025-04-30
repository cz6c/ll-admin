import { IsString, IsEnum, Length, IsOptional, IsNumber, IsDate } from 'class-validator';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { BaseVO, PagingDto } from '@/common/dto/index';
import { PushIntervalEnum, PushModelEnum, StatusEnum } from '@/common/enum/dict';

export class CreatePushTaskDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  pushtaskName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 200)
  acceptEmail: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 200)
  pushTitle: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 200)
  pushContent: string;

  @ApiProperty({ required: true })
  @IsEnum(PushModelEnum)
  pushModel: PushModelEnum;

  @ApiProperty({ required: true })
  @IsEnum(PushIntervalEnum)
  pushInterval: PushIntervalEnum;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  status: StatusEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  pushTime?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}

export class UpdatePushTaskDto extends CreatePushTaskDto {
  @ApiProperty({ required: true })
  @IsNumber()
  pushtaskId: number;
}

export class ChangeStatusDto extends PickType(UpdatePushTaskDto, ['pushtaskId', 'status'] as const) {}

export class ListPushTaskDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  pushtaskName?: string;
}

export class PushTaskVO extends BaseVO {
  @ApiProperty({ description: '任务ID', example: 1 })
  public pushtaskId: number;

  @ApiProperty({ description: '任务名称', example: '每日新闻推送' })
  public pushtaskName: string;

  @ApiProperty({ description: '接受邮箱', example: 'example@example.com' })
  public acceptEmail: string;

  @ApiProperty({ description: '推送标题', example: '今日新闻' })
  public pushTitle: string;

  @ApiProperty({ description: '推送内容', example: '这是今天的新闻内容...' })
  public pushContent: string;

  @ApiProperty({
    description: '推送类型',
    enum: PushModelEnum,
    example: PushModelEnum.REGULAR,
  })
  public pushModel: PushModelEnum;

  @ApiProperty({
    description: '定期推送间隔',
    enum: PushIntervalEnum,
    example: PushIntervalEnum.EVERYDAY,
  })
  public pushInterval: PushIntervalEnum;

  @ApiProperty({ description: '定期推送时间', example: '09:00' })
  public startDate: string;

  @ApiProperty({ description: '按时推送时间', format: 'date-time', example: '2023-04-01T09:00:00Z' })
  public pushTime: Date;

  @ApiProperty({ description: '备注', example: '这是关于新闻推送的备注信息' })
  public remark: string;
}
