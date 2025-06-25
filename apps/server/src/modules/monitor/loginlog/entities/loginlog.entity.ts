import { SuccessErrorEnum } from '@/common/enum/dict';
import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('sys_logininfor', { comment: '系统访问记录' })
export class MonitorLoginlogEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'info_id', comment: '访问ID' })
  public infoId: number;

  @CreateDateColumn({ type: 'datetime', name: 'login_time', default: null, comment: '访问时间' })
  public loginTime: Date;

  @Column({ type: 'varchar', name: 'user_name', length: 50, default: '', comment: '用户账号' })
  public userName: string;

  @Column({ type: 'varchar', name: 'ipaddr', length: 128, default: '', comment: '登录IP地址' })
  public ipaddr: string;

  @Column({ type: 'varchar', name: 'login_location', length: 255, default: '', comment: '登录地点' })
  public loginLocation: string;

  @Column({ type: 'varchar', name: 'browser', length: 50, default: '', comment: '浏览器类型' })
  public browser: string;

  @Column({ type: 'varchar', name: 'os', length: 50, default: '', comment: '操作系统' })
  public os: string;

  //提示消息
  @Column({ type: 'varchar', name: 'msg', length: 255, default: '', comment: '提示消息' })
  public msg: string;

  //0失败 1成功
  @Column({ type: 'enum', enum: SuccessErrorEnum, default: SuccessErrorEnum.SUCCESS, name: 'status', comment: '状态' })
  public status: SuccessErrorEnum;
}
