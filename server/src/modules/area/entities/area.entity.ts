import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('province')
export class ProvinceEntity {
  /** 名称 */
  @Column({ nullable: true })
  name: string;

  /** code */
  @PrimaryColumn()
  code: string;
}

@Entity('city')
export class CityEntity {
  /** 名称 */
  @Column({ nullable: true })
  name: string;

  /** code */
  @PrimaryColumn()
  code: string;

  /** 省code */
  @Column({ nullable: true })
  provinceCode: string;
}

@Entity('area')
export class AreaEntity {
  @ApiProperty({ type: String, description: '名称' })
  @Column({ nullable: true })
  public name: string;

  @ApiProperty({ type: String, description: '区code' })
  @PrimaryColumn()
  public code: string;

  @ApiProperty({ type: String, description: '省code' })
  @Column({ nullable: true })
  public provinceCode: string;

  @ApiProperty({ type: String, description: '市code' })
  @Column({ nullable: true })
  public cityCode: string;
}
