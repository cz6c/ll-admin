import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base';

// comment: '岗位信息表',
@Entity('sys_post')
export class SysPostEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'post_id', comment: '岗位ID' })
  public postId: number;

  @Column({ type: 'varchar', name: 'post_code', length: 64, comment: '岗位编码' })
  public postCode: string;

  @Column({ type: 'varchar', name: 'post_name', length: 50, comment: '岗位名称' })
  public postName: string;

  @Column({ type: 'int', name: 'post_sort', default: 0, comment: '显示顺序' })
  public postSort: number;
}
