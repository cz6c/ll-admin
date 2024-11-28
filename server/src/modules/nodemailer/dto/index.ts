import { IsString, IsEnum, Length, IsOptional, IsNumber, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PagingDto } from '@/common/dto/index';
import { StatusEnum } from '@/common/enum';

/**
 * 推送类型:1定期推送,2按时推送
 */
export enum PushModelEnum {
  /**
   * 1定期推送
   */
  REGULAR = '1',
  /**
   * 2按时推送
   */
  PUNCTUAL = '2',
}

/**
 * 定期推送间隔:1每日 2每周 3每月
 */
export enum PushIntervalEnum {
  /**
   * 1每日
   */
  EVERYDAY = '1',
  /**
   * 2每周
   */
  WEEKLY = '2',
  /**
   * 3每月
   */
  MONTHLY = '3',
}

export class CreateNodemailerPushTaskDto {
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
  @IsEnum(PushModelEnum)
  pushModel: PushModelEnum;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 200)
  pushTitle: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 200)
  pushContent: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsEnum(PushIntervalEnum)
  pushInterval?: string;

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
  @IsEnum(StatusEnum)
  status?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}

export class UpdateNodemailerPushTaskDto extends CreateNodemailerPushTaskDto {
  @ApiProperty({ required: true })
  @IsNumber()
  pushtaskId: number;
}

export class ListNodemailerPushTaskDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  pushtaskName?: string;
}

/**
 * 推送状态:1成功,2失败
 */
export enum PushStatusEnum {
  SUCCESS = '1',
  FAIL = '2',
}

export class ListNodemailerPushLogDto extends ListNodemailerPushTaskDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsEnum(PushStatusEnum)
  pushStatus?: string;
}
