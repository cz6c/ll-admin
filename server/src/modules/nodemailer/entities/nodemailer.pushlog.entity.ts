import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// comment: '推送日志表',
@Entity('nodemailer_pushlog')
export class NodemailerPushLogEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'pushlog_id', comment: '推送日志id' })
  public pushlogId: number;

  @CreateDateColumn({ type: 'datetime', name: 'create_time', default: null, comment: '创建时间' })
  public createTime: Date;

  // 1 推送成功  2 推送失败
  @Column({ type: 'char', name: 'push_status', length: 1, default: '', comment: '推送状态' })
  public pushStatus: string;

  @Column({ type: 'int', name: 'pushtask_id', default: null, comment: '任务ID' })
  public pushtaskId: number;

  @Column({ type: 'varchar', name: 'pushtask_name', length: 50, default: '', comment: '任务名称' })
  public pushtaskName: string;

  @Column({ type: 'varchar', name: 'accept_email', length: 200, default: '', comment: '接受邮箱' })
  public acceptEmail: string;

  @Column({ type: 'varchar', name: 'push_title', length: 200, default: '', comment: '推送标题' })
  public pushTitle: string;

  @Column({ type: 'varchar', name: 'push_content', length: 200, default: '', comment: '推送内容' })
  public pushContent: string;

  @Column({ type: 'varchar', name: 'remark', length: 500, default: null, comment: '备注' })
  public remark: string;
}
