import { IsNumber, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AreaEntity } from '../entities/area.entity';

export class AeraVO extends AreaEntity {
  @ApiPropertyOptional({ type: [AreaEntity], description: 'children' })
  readonly children: AreaEntity[];
}

// 列表查询
export class AeraListParamsDto {
  @ApiProperty({ description: 'code' })
  @IsString()
  readonly code: string;

  @ApiProperty({ description: 'level' })
  @IsNumber()
  readonly level: 1 | 2 | 3;
}
