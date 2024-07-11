import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/entities/base';

// comment: '字典类型表',
@Entity('sys_dict_type')
export class SysDictTypeEntity extends BaseEntity {
  @ApiProperty({ type: String, description: '字典主键' })
  @PrimaryGeneratedColumn({ type: 'int', name: 'dict_id', comment: '字典主键' })
  public dictId: number;

  @Column({ type: 'varchar', name: 'dict_name', length: 100, comment: '字典名称' })
  public dictName: string;

  @Column({ type: 'varchar', name: 'dict_type', unique: true, length: 100, comment: '字典类型' })
  public dictType: string;
}
