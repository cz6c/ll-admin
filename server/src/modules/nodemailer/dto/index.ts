import { IsString, IsEnum, Length, IsOptional, IsNumber, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PagingDto } from '@/common/dto/index';
import { StatusEnum } from '@/common/enum';

/**
 * 数据状态:0正常,1停用
 */
export enum PushModelEnum {
  /**
   * 定期推送
   */
  REGULAR = '1',
  /**
   * 按时推送
   */
  PUNCTUAL = '2',
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
  pushModel: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 200)
  pushContent: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  pushInterval?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  startTime?: Date;

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
