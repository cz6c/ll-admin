import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ResultData } from '@/common/utils/result';
import { NodemailerPushTaskEntity } from './entities/nodemailer.pushtask.entity';
import { NodemailerPushLogEntity } from './entities/nodemailer.pushlog.entity';
import {
  CreateNodemailerPushTaskDto,
  UpdateNodemailerPushTaskDto,
  ListNodemailerPushTaskDto,
  ListNodemailerPushLogDto,
  PushIntervalEnum,
  PushModelEnum,
  CreateNodemailerPushLogDto,
  PushStatusEnum,
  SendMailOptionsType,
} from './dto/index';
import { DelFlagEnum, StatusEnum } from '@/common/enum';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { isArray } from '@/common/utils/is';

@Injectable()
export class NodemailerService {
  private transporter: nodemailer.Transporter;
  private mailConfig;
  constructor(
    @InjectRepository(NodemailerPushTaskEntity)
    private readonly nodemailerPushTaskEntity: Repository<NodemailerPushTaskEntity>,
    @InjectRepository(NodemailerPushLogEntity)
    private readonly nodemailerPushLogEntity: Repository<NodemailerPushLogEntity>,
    // 定时任务注册器
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
  ) {
    this.mailConfig = this.configService.get('mail');
    this.transporter = nodemailer.createTransport(this.mailConfig);
  }

  // 处理定时任务
  handleTask(res: NodemailerPushTaskEntity) {
    // 注册定时任务发送邮件
    let cronTime: string | Date = '';
    let once = false;
    if (res.pushModel === PushModelEnum.PUNCTUAL) {
      cronTime = new Date(res.pushTime);
      once = true;
    } else {
      // 定时任务 处理Cron表达式 Seconds Minutes Hours DayofMonth Month DayofWeek
      const [time, num] = res.startDate.split(',');
      const [h, m] = time.split(':');
      switch (res.pushInterval) {
        case PushIntervalEnum.EVERYDAY:
          cronTime = `0 ${m} ${h} * * ?`;
          break;
        case PushIntervalEnum.WEEKLY:
          cronTime = `0 ${m} ${h} ? * ${num}`;
          break;
        case PushIntervalEnum.MONTHLY:
          cronTime = `0 ${m} ${h} ${num} * ?`;
          break;
      }
    }
    // 创建定时任务
    const job: CronJob = new CronJob(
      cronTime,
      async () => {
        const options = { to: res.acceptEmail, subject: res.pushTitle, text: res.pushContent, pushTask: res };
        await this.sendMail(options);
        once && this.deleteCron(res.pushtaskName);
      },
      null, // onComplete
    );
    this.registerTask(res.pushtaskName, job);
  }

  async createPushTask(createNodemailerPushTaskDto: CreateNodemailerPushTaskDto) {
    const list = await this.nodemailerPushTaskEntity.find({
      where: {
        pushtaskName: createNodemailerPushTaskDto.pushtaskName,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    if (list.length > 0) return ResultData.fail(400, '任务名称已存在');
    const res = await this.nodemailerPushTaskEntity.save(createNodemailerPushTaskDto);
    this.handleTask(res);
    return ResultData.ok();
  }

  async findAllPushTask(query: ListNodemailerPushTaskDto) {
    const entity = this.nodemailerPushTaskEntity.createQueryBuilder('entity');
    entity.where('entity.delFlag = :delFlag', { delFlag: DelFlagEnum.NORMAL });

    if (query.pushtaskName) {
      entity.andWhere(`entity.pushtaskName LIKE "%${query.pushtaskName}%"`);
    }
    entity.orderBy('entity.postSort', 'ASC');

    if (query.pageSize && query.pageNum) {
      entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    }

    const [list, total] = await entity.getManyAndCount();

    return ResultData.ok({
      list,
      total,
    });
  }

  async findOnePushTask(id: number) {
    const res = await this.nodemailerPushTaskEntity.findOne({
      where: {
        pushtaskId: id,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    return ResultData.ok(res);
  }

  // 更新定时任务
  async updatePushTask(updateNodemailerPushTaskDto: UpdateNodemailerPushTaskDto) {
    await this.nodemailerPushTaskEntity.update({ pushtaskId: updateNodemailerPushTaskDto.pushtaskId }, updateNodemailerPushTaskDto);
    const item = await this.nodemailerPushTaskEntity.findOne({
      where: {
        pushtaskId: updateNodemailerPushTaskDto.pushtaskId,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    this.deleteCron(item.pushtaskName);
    this.handleTask(item);
    return ResultData.ok(null);
  }

  // 开启关闭定时任务
  async switchStatus(pushtaskId: UpdateNodemailerPushTaskDto['pushtaskId']) {
    const item = await this.nodemailerPushTaskEntity.findOne({
      where: {
        pushtaskId,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    const status = item.status === StatusEnum.NORMAL ? StatusEnum.STOP : StatusEnum.NORMAL;
    await this.nodemailerPushTaskEntity.update({ pushtaskId }, { status });
    if (status === StatusEnum.NORMAL) {
      this.startCronJob(item.pushtaskName);
    } else {
      this.stopCronJob(item.pushtaskName);
    }
    return ResultData.ok(null);
  }

  // 批量删除定时任务
  async removePushTask(ids: string[]) {
    const data = await this.nodemailerPushTaskEntity.update(
      { pushtaskId: In(ids) },
      {
        delFlag: DelFlagEnum.DELETE,
      },
    );
    for (let index = 0; index < ids.length; index++) {
      const id = +ids[index];
      const res = await this.nodemailerPushTaskEntity.findOne({
        where: { pushtaskId: id },
      });
      this.deleteCron(res.pushtaskName);
    }
    return ResultData.ok(data);
  }

  // 插入推送日志
  async createPushLog(createNodemailerPushLogDto: CreateNodemailerPushLogDto) {
    await this.nodemailerPushLogEntity.save(createNodemailerPushLogDto);
  }

  // 查询推送日志列表
  async findAllPushLog(query: ListNodemailerPushLogDto) {
    const entity = this.nodemailerPushLogEntity.createQueryBuilder('entity');

    if (query.pushtaskName) {
      entity.andWhere(`entity.pushtaskName LIKE "%${query.pushtaskName}%"`);
    }
    if (query.pushStatus) {
      entity.andWhere('entity.pushStatus = :pushStatus', { pushStatus: query.pushStatus });
    }
    entity.orderBy('entity.createTime', 'ASC');

    if (query.pageSize && query.pageNum) {
      entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    }

    const [list, total] = await entity.getManyAndCount();

    return ResultData.ok({
      list,
      total,
    });
  }

  // 注册任务
  public registerTask(name: string, job: CronJob) {
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
  }
  // 删除任务
  public deleteCron(name: string) {
    this.schedulerRegistry.getCronJob(name) && this.schedulerRegistry.deleteCronJob(name);
  }
  // 暂停CronJob
  public stopCronJob(name: string) {
    this.schedulerRegistry.getCronJob(name)?.stop();
  }
  // 启动CronJob
  public startCronJob(name: string) {
    this.schedulerRegistry.getCronJob(name)?.start();
  }

  // 发送邮件
  async sendMail(options: SendMailOptionsType): Promise<void> {
    const { to, subject, text, html, pushTask } = options;
    const pushLog = {
      acceptEmail: isArray(to) ? to.join(',') : to,
      pushTitle: subject,
      pushContent: html || text,
      ...pushTask,
    };
    try {
      const mailOptions = {
        from: this.mailConfig.auth.user,
        to,
        subject,
        text,
        html,
      };
      await this.transporter.sendMail(mailOptions);
      this.createPushLog({ ...pushLog, pushStatus: PushStatusEnum.SUCCESS });
    } catch (error) {
      this.createPushLog({ ...pushLog, pushStatus: PushStatusEnum.FAIL });
      console.log('🚀 sendMail ~ error:', error);
    }
  }
}
