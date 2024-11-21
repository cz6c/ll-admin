import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// comment: '推送日志表',
@Entity('nodemailer_pushlog')
export class NodemailerPushLogEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'pushlog_id', comment: '推送日志id' })
  public pushlogId: number;

  @PrimaryGeneratedColumn({ type: 'int', name: 'pushtask_id', comment: '任务ID' })
  public pushtaskId: number;

  @Column({ type: 'varchar', name: 'pushtask_name', length: 50, default: '', comment: '任务名称' })
  public pushtaskName: string;

  @Column({ type: 'varchar', name: 'accept_email', length: 200, default: '', comment: '接受邮箱' })
  public acceptEmail: string;

  // 1 定期推送  2 按时推送
  @Column({ type: 'char', name: 'push_Model', length: 1, default: '', comment: '推送类型' })
  public pushModel: string;

  // 定期推送 根据这个字段判断 x小时推送一次
  @Column({ type: 'int', name: 'push_interval', default: 0, comment: '定期推送间隔' })
  public pushInterval: number;

  @Column({ type: 'datetime', name: 'start_time', default: null, comment: '定期开始时间' })
  public startTime: Date;

  // 按时推送 根据这个字段判断 推送一次
  @Column({ type: 'datetime', name: 'push_time', default: null, comment: '推送时间' })
  public pushTime: Date;

  @Column({ type: 'varchar', name: 'push_content', length: 200, default: '', comment: '推送内容' })
  public pushContent: string;

  @Column({ type: 'varchar', name: 'remark', length: 500, default: null, comment: '备注' })
  public remark: string;

  @CreateDateColumn({ type: 'datetime', name: 'create_time', default: null, comment: '创建时间' })
  public createTime: Date;
}
