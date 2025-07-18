import { IsString, IsEnum, Length, IsOptional, IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { BaseVO, PagingDto } from "@/common/dto/index";
import { YesNoEnum } from "@/common/enum/dict";

export class CreateConfigDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 100)
  configName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 500)
  configValue: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 100)
  configKey: string;

  @ApiProperty({ required: true })
  @IsEnum(YesNoEnum)
  configType: YesNoEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}

export class UpdateConfigDto extends CreateConfigDto {
  @ApiProperty({ required: true })
  @IsNumber()
  configId: number;
}

export class ListConfigDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  configName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  configKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(YesNoEnum)
  configType?: YesNoEnum;
}

export class SysConfigVo extends BaseVO {
  @ApiProperty({ description: "参数主键" })
  public configId: number;

  @ApiProperty({ description: "参数名称" })
  public configName: string;

  @ApiProperty({ description: "参数键" })
  public configKey: string;

  @ApiProperty({ description: "参数键值" })
  public configValue: string;

  @ApiProperty({
    description: "系统内置",
    enum: YesNoEnum
  })
  public configType: YesNoEnum;

  @ApiProperty({ description: "备注" })
  public remark: string;
}
