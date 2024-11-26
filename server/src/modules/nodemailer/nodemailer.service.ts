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
  PushStatusEnum,
  PushIntervalEnum,
  PushModelEnum,
} from './dto/index';
import { DelFlagEnum, StatusEnum } from '@/common/enum';
import { TaskService } from '../../plugins/task.service';
import { EmailService } from '../../plugins/email.service';

@Injectable()
export class NodemailerService {
  constructor(
    @InjectRepository(NodemailerPushTaskEntity)
    private readonly nodemailerPushTaskEntity: Repository<NodemailerPushTaskEntity>,
    @InjectRepository(NodemailerPushLogEntity)
    private readonly nodemailerPushLogEntity: Repository<NodemailerPushLogEntity>,
    private readonly taskService: TaskService,
    private readonly emailService: EmailService,
  ) {}

  // 根据状态处理定时任务
  handleTask(res) {
    // 注册定时任务发送邮件
    if (res.status === StatusEnum.NORMAL) {
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
      this.taskService.registerTask(res.pushtaskName, cronTime, async () => {
        try {
          await this.emailService.sendMail(res.acceptEmail, res.pushTitle, res.pushContent);
          await this.nodemailerPushLogEntity.save({ ...res, pushStatus: PushStatusEnum.SUCCESS });
          once && this.taskService.deleteCron(res.pushtaskName);
        } catch (error) {
          await this.nodemailerPushLogEntity.save({ ...res, pushStatus: PushStatusEnum.FAIL });
        }
      });
    } else {
      this.taskService.stopCronJob(res.pushtaskName);
    }
  }

  async createPushTask(createNodemailerPushTaskDto: CreateNodemailerPushTaskDto) {
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

  async updatePushTask(updateNodemailerPushTaskDto: UpdateNodemailerPushTaskDto) {
    const res = await this.nodemailerPushTaskEntity.update({ pushtaskId: updateNodemailerPushTaskDto.pushtaskId }, updateNodemailerPushTaskDto);
    this.handleTask(res);
    return ResultData.ok(res);
  }

  async removePushTask(ids: string[]) {
    const data = await this.nodemailerPushTaskEntity.update(
      { pushtaskId: In(ids) },
      {
        delFlag: DelFlagEnum.DELETE,
      },
    );
    // 批量删除定时任务
    for (let index = 0; index < ids.length; index++) {
      const id = +ids[index];
      const res = await this.nodemailerPushTaskEntity.findOne({
        where: { pushtaskId: id },
      });
      this.taskService.deleteCron(res.pushtaskName);
    }
    return ResultData.ok(data);
  }

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
}
