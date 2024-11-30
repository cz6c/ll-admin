import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base';

// comment: '邮件推送任务表',
@Entity('nodemailer_pushtask')
export class NodemailerPushTaskEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'pushtask_id', comment: '任务ID' })
  public pushtaskId: number;

  @Column({ type: 'varchar', name: 'pushtask_name', length: 50, default: '', comment: '任务名称' })
  public pushtaskName: string;

  @Column({ type: 'varchar', name: 'accept_email', length: 200, default: '', comment: '接受邮箱' })
  public acceptEmail: string;

  @Column({ type: 'varchar', name: 'push_title', length: 200, default: '', comment: '推送标题' })
  public pushTitle: string;

  @Column({ type: 'varchar', name: 'push_content', length: 200, default: '', comment: '推送内容' })
  public pushContent: string;

  // 1 定期推送  2 按时推送
  @Column({ type: 'char', name: 'push_Model', length: 1, default: '', comment: '推送类型' })
  public pushModel: string;

  // 定期推送 根据这个字段判断 1每日 2每周 3每月 推送
  @Column({ type: 'char', name: 'push_interval', length: 1, default: '', comment: '定期推送间隔' })
  public pushInterval: string;
  // 每日时 时间  每周时 周几,时间  每月时 几号,时间
  @Column({ type: 'varchar', name: 'start_date', length: 50, default: '', comment: '定期推送时间' })
  public startDate: string;

  // 按时推送 根据这个字段判断 只推送一次
  @Column({ type: 'datetime', name: 'push_time', default: null, comment: '按时推送时间' })
  public pushTime: Date;
}