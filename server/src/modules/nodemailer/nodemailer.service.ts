import { Injectable, Logger } from '@nestjs/common';
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
  CreateNodemailerPushLogDto,
  SendMailOptionsType,
  ChangeStatusDto,
} from './dto/index';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { isArray } from '@/common/utils/is';
import { DelFlagEnum, PushIntervalEnum, PushModelEnum, SuccessErrorEnum, StatusEnum } from '@/common/enum/dict';

@Injectable()
export class NodemailerService {
  private readonly logger = new Logger(NodemailerService.name);
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

  /**
   * @description:邮箱推送任务-创建
   * @param {CreateNodemailerPushTaskDto} createNodemailerPushTaskDto
   * @param {number} userId
   * @return
   */
  async createPushTask(createNodemailerPushTaskDto: CreateNodemailerPushTaskDto, userId: number) {
    const list = await this.nodemailerPushTaskEntity.find({
      where: {
        pushtaskName: createNodemailerPushTaskDto.pushtaskName,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    if (list.length > 0) return ResultData.fail(400, '任务名称已存在');
    const res = await this.nodemailerPushTaskEntity.save({ ...createNodemailerPushTaskDto, createBy: userId });
    this.handleTask(res);
    return ResultData.ok();
  }

  /**
   * @description: 邮箱推送任务-列表
   * @param {ListNodemailerPushTaskDto} query
   * @return
   */
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

  /**
   * @description: 邮箱推送任务-详情
   * @param {number} id
   * @return
   */
  async findOnePushTask(id: number) {
    const res = await this.nodemailerPushTaskEntity.findOne({
      where: {
        pushtaskId: id,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    return ResultData.ok(res);
  }

  /**
   * @description: 邮箱推送任务-更新
   * @param {UpdateNodemailerPushTaskDto} updateNodemailerPushTaskDto
   * @param {number} userId
   * @return
   */
  async updatePushTask(updateNodemailerPushTaskDto: UpdateNodemailerPushTaskDto, userId: number) {
    await this.nodemailerPushTaskEntity.update({ pushtaskId: updateNodemailerPushTaskDto.pushtaskId }, { ...updateNodemailerPushTaskDto, updateBy: userId });
    const item = await this.nodemailerPushTaskEntity.findOne({
      where: {
        pushtaskId: updateNodemailerPushTaskDto.pushtaskId,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    this.deleteCron(item.pushtaskName);
    this.handleTask(item);
    return ResultData.ok();
  }

  /**
   * @description: 邮箱推送任务-切换状态
   * @param {ChangeStatusDto} changeStatusDto
   * @param {number} userId
   * @return
   */
  async switchStatus(changeStatusDto: ChangeStatusDto, userId: number) {
    const item = await this.nodemailerPushTaskEntity.findOne({
      where: {
        pushtaskId: changeStatusDto.pushtaskId,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    if (item.status === changeStatusDto.status) return ResultData.ok();
    await this.nodemailerPushTaskEntity.update({ pushtaskId: changeStatusDto.pushtaskId }, { status: changeStatusDto.status, updateBy: userId });
    if (changeStatusDto.status === StatusEnum.NORMAL) {
      this.startCronJob(item.pushtaskName);
    } else {
      this.stopCronJob(item.pushtaskName);
    }
    return ResultData.ok();
  }

  /**
   * @description: 邮箱推送任务-删除
   * @param {number[]} ids
   * @param {number} userId
   * @return
   */
  async removePushTask(ids: number[], userId: number) {
    await this.nodemailerPushTaskEntity.update(
      { pushtaskId: In(ids) },
      {
        delFlag: DelFlagEnum.DELETE,
        updateBy: userId,
      },
    );
    for (let index = 0; index < ids.length; index++) {
      const id = +ids[index];
      const res = await this.nodemailerPushTaskEntity.findOne({
        where: { pushtaskId: id },
      });
      this.deleteCron(res.pushtaskName);
    }
    return ResultData.ok();
  }

  /**
   * @description: 邮箱推送任务-日志列表
   * @param {ListNodemailerPushLogDto} query
   * @return
   */
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

  /**
   * @description: 插入推送日志
   * @param {CreateNodemailerPushLogDto} createNodemailerPushLogDto
   * @return
   */
  async createPushLog(createNodemailerPushLogDto: CreateNodemailerPushLogDto) {
    await this.nodemailerPushLogEntity.save(createNodemailerPushLogDto);
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
  async sendMail(options: SendMailOptionsType) {
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
      this.createPushLog({ ...pushLog, pushStatus: SuccessErrorEnum.SUCCESS });
    } catch (error) {
      this.createPushLog({ ...pushLog, pushStatus: SuccessErrorEnum.FAIL });
      this.logger.error('🚀 sendMail ~ error:', error);
    }
  }
}
