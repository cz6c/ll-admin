import { IsString, Length, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PagingDto } from '@/common/dto/index';

export class CreateLoginlogDto {
  @IsOptional()
  @IsString()
  @Length(0, 128)
  ipaddr?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  userName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  loginLocation?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  browser?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  os?: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  msg?: string;
}

export class UpdateLoginlogDto extends CreateLoginlogDto {
  @IsNumber()
  infoId: number;
}

export class ListLoginlogDto extends PagingDto {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(0, 128)
  ipaddr?: string;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  userName?: string;
}
