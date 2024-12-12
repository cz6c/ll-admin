import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('province', { comment: '省' })
export class ProvinceEntity {
  /** 名称 */
  @Column({ nullable: true })
  name: string;

  /** code */
  @PrimaryColumn()
  code: string;
}

@Entity('city', { comment: '市' })
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

@Entity('area', { comment: '区' })
export class AreaEntity {
  @Column({ nullable: true })
  public name: string;

  @PrimaryColumn()
  public code: string;

  @Column({ nullable: true })
  public provinceCode: string;

  @Column({ nullable: true })
  public cityCode: string;
}
