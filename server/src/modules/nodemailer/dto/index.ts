import { IsString, IsEnum, Length, IsOptional, IsNumber, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PagingDto } from '@/common/dto/index';
import { PushIntervalEnum, PushModelEnum, SuccessErrorEnum, StatusEnum } from '@/common/enum/dict';

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
  @IsEnum(PushIntervalEnum)
  pushInterval?: PushIntervalEnum;

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
  @IsEnum(StatusEnum)
  status?: StatusEnum;

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

export class CreateNodemailerPushLogDto {
  @IsOptional()
  @IsEnum(SuccessErrorEnum)
  pushStatus: SuccessErrorEnum;

  @IsString()
  @Length(0, 50)
  pushtaskId?: number;

  @IsString()
  @Length(0, 50)
  pushtaskName?: string;

  @IsString()
  @Length(0, 200)
  acceptEmail: string;

  @IsString()
  @Length(0, 200)
  pushTitle: string;

  @IsString()
  @Length(0, 200)
  pushContent: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}

export class ListNodemailerPushLogDto extends ListNodemailerPushTaskDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(SuccessErrorEnum)
  pushStatus?: SuccessErrorEnum;
}

export interface SendMailOptionsType {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  pushTask: {
    pushtaskId?: number;
    pushtaskName?: string;
    remark?: string;
  };
}
