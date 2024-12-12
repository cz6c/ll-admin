import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base';
import { YesNoEnum } from '@/common/enum/dict';

@Entity('sys_config', { comment: '参数配置表' })
export class SysConfigEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'config_id', comment: '参数主键' })
  public configId: number;

  @Column({ type: 'varchar', name: 'config_name', length: 100, default: '', comment: '参数名称' })
  public configName: string;

  @Column({ type: 'varchar', name: 'config_key', length: 100, default: '', comment: '参数键' })
  public configKey: string;

  @Column({ type: 'varchar', name: 'config_value', length: 500, default: '', comment: '参数键值' })
  public configValue: string;

  //系统内置（0是 1否）
  @Column({ type: 'enum', enum: YesNoEnum, default: YesNoEnum.NO, name: 'config_type', comment: '系统内置' })
  public configType: YesNoEnum;

  @Column({ type: 'varchar', name: 'remark', length: 500, default: '', comment: '备注' })
  public remark: string;
}
