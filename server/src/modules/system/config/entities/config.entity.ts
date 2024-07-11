import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base';

// comment: '参数配置表',
@Entity('sys_config')
export class SysConfigEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'config_id', comment: '参数主键' })
  public configId: number;

  @Column({ type: 'varchar', name: 'config_name', length: 100, default: '', comment: '参数名称' })
  public configName: string;

  @Column({ type: 'varchar', name: 'config_key', length: 100, default: '', comment: '岗位编码' })
  public configKey: string;

  @Column({ type: 'varchar', name: 'config_value', length: 500, default: '', comment: '参数键值' })
  public configValue: string;

  //系统内置（Y是 N否）
  @Column({ type: 'char', name: 'config_type', length: 1, default: 'N', comment: '系统内置' })
  public configType: string;
}
