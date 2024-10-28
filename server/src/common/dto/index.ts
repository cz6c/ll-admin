import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 分页DTO
 */
export class PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  pageNum?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  pageSize?: number;

  /**
   * 时间区间
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  beginTime: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endTime: string;

  /**
   * 排序字段
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orderByColumn?: string;

  /**
   * 排序规则
   */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  order?: 'ascending' | 'descending';
}
