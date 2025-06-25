import { IsString, Length, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { PagingDto } from '@/common/dto/index';
import { SuccessErrorEnum } from '@/common/enum/dict';

export class CreateLoginlogDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 128)
  ipaddr: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  userName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 255)
  loginLocation: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  browser: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  os: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 255)
  msg: string;

  @ApiProperty({ required: true })
  @IsEnum(SuccessErrorEnum)
  status: SuccessErrorEnum;
}

export class ClientInfoDto extends PickType(CreateLoginlogDto, ['ipaddr', 'os', 'browser'] as const) {}

export class ListLoginlogDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 128)
  ipaddr?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  userName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(SuccessErrorEnum)
  status: SuccessErrorEnum;
}

export class MonitorLoginlogVO {
  @ApiProperty({ description: '访问ID', example: 1 })
  public infoId: number;

  @ApiProperty({ description: '用户账号', example: 'admin' })
  public userName: string;

  @ApiProperty({ description: '登录IP地址', example: '192.168.1.1' })
  public ipaddr: string;

  @ApiProperty({ description: '登录地点', example: '北京' })
  public loginLocation: string;

  @ApiProperty({ description: '浏览器类型', example: 'Chrome' })
  public browser: string;

  @ApiProperty({ description: '操作系统', example: 'Windows 10' })
  public os: string;

  @ApiProperty({ description: '访问时间', example: '2023-04-01T12:00:00Z', format: 'date-time' })
  public loginTime: Date;

  @ApiProperty({ description: '提示消息', example: '登录成功' })
  public msg: string;

  @ApiProperty({
    description: '状态（0正常 1停用）',
    enum: SuccessErrorEnum,
    example: SuccessErrorEnum.SUCCESS,
  })
  public status: SuccessErrorEnum;
}
