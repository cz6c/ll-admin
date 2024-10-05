import { IsString, Length, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @Length(2, 10)
  userName: string;

  @IsString()
  @Length(5, 20)
  password: string;

  @IsOptional()
  @IsString()
  uuid?: string;
}

export class RegisterDto extends LoginDto {}

export class ClientInfoDto {
  ipaddr: string;
  userAgent: string;
  browser: string;
  os: string;
  loginLocation: string;
}
