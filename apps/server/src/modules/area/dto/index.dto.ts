import { IsNumber, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 列表查询
export class AeraListParamsDto {
  @ApiProperty({ description: 'code' })
  @IsString()
  readonly code: string;

  @ApiProperty({ description: 'level' })
  @IsNumber()
  readonly level: 1 | 2 | 3;
}

export class AeraVO {
  @ApiProperty({ type: String, description: '名称' })
  public name: string;

  @ApiProperty({ type: String, description: '区code' })
  public code: string;

  @ApiProperty({ type: String, description: '省code' })
  public provinceCode: string;

  @ApiProperty({ type: String, description: '市code' })
  public cityCode: string;
}

export class AeraTreeVO {
  @ApiProperty({ type: String, description: '名称' })
  public name: string;

  @ApiProperty({ type: String, description: 'code' })
  public code: string;

  @ApiProperty({ type: String, description: '父code' })
  public parentCode: string;

  @ApiPropertyOptional({ type: [AeraTreeVO], description: 'children' })
  readonly children: AeraTreeVO[];
}
