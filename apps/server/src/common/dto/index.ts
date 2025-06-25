import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DelFlagEnum, StatusEnum } from '../enum/dict';

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

export class BaseVO {
  @ApiProperty({
    description: '状态',
    enum: StatusEnum,
    example: StatusEnum.NORMAL,
  })
  public status: StatusEnum;

  @ApiProperty({
    description: '删除标志',
    enum: DelFlagEnum,
    example: DelFlagEnum.NORMAL,
  })
  public delFlag: DelFlagEnum;

  @ApiProperty({ type: Number, description: '创建者', example: 1 })
  public createBy: number;

  @ApiProperty({ type: Date, description: '创建时间', example: '2021-01-01T13:14:00.000Z' })
  public createTime: Date;

  @ApiProperty({ type: Number, description: '更新者', example: 1 })
  public updateBy: number;

  @ApiProperty({ type: Date, description: '更新时间', example: '2021-01-01T13:14:00.000Z' })
  public updateTime: Date;
}
