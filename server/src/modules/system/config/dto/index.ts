import { IsString, IsEnum, Length, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PagingDto } from '@/common/dto/index';
import { ConfigTypeEnum, StatusEnum } from '@/common/enum/dict';

export class CreateConfigDto {
  @IsString()
  @Length(0, 100)
  configName: string;

  @IsString()
  @Length(0, 500)
  configValue: string;

  @IsString()
  @Length(0, 100)
  configKey: string;

  @IsEnum(ConfigTypeEnum)
  configType: ConfigTypeEnum;

  @ApiProperty({
    required: true,
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;
}

export class UpdateConfigDto extends CreateConfigDto {
  @IsNumber()
  configId: number;
}

export class ListConfigDto extends PagingDto {
  @IsOptional()
  @IsString()
  @Length(0, 100)
  configName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  configKey?: string;

  @IsOptional()
  @IsEnum(ConfigTypeEnum)
  configType?: ConfigTypeEnum;
}
