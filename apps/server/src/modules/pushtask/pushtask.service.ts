import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ResultData } from '@/common/utils/result';
import { PushTaskEntity } from './entities/pushtask.entity';
import { CreatePushTaskDto, ListPushTaskDto, ChangeStatusDto } from './dto/index';
import { DelFlagEnum, PushIntervalEnum, PushModelEnum, StatusEnum, TaskTypeEnum } from '@/common/enum/dict';
import { TaskService } from '@/modules/tasks/task.service';

@Injectable()
export class PushTaskService {
  private readonly logger = new Logger(PushTaskService.name);
  constructor(
    @InjectRepository(PushTaskEntity)
    private readonly nodemailerPushTaskEntity: Repository<PushTaskEntity>,
    private readonly tasksService: TaskService,
  ) {}

  // 处理定时任务
  handleTask(res: PushTaskEntity) {
    // 注册定时任务发送邮件
    let cronTime = '';
    if (res.pushModel === PushModelEnum.REGULAR) {
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
    this.tasksService.createTask({
      taskName: `nodemailer_push${res.pushtaskId}`,
      payload: JSON.stringify({ to: res.acceptEmail, subject: res.pushTitle, text: res.pushContent, pushTask: res }),
      taskType: cronTime ? TaskTypeEnum.LOOP : TaskTypeEnum.ONCE,
      executeAt: new Date(res.pushTime),
      cronExpression: cronTime,
    });
  }

  /**
   * @description:邮箱推送任务-创建
   * @param {CreatePushTaskDto} createPushTaskDto
   * @param {number} userId
   * @return
   */
  async createPushTask(createPushTaskDto: CreatePushTaskDto, userId: number) {
    const list = await this.nodemailerPushTaskEntity.find({
      where: {
        pushtaskName: createPushTaskDto.pushtaskName,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    if (list.length > 0) return ResultData.fail(400, '任务名称已存在');
    const res = await this.nodemailerPushTaskEntity.save({ ...createPushTaskDto, createBy: userId });
    this.handleTask(res);
    return ResultData.ok();
  }

  /**
   * @description: 邮箱推送任务-列表
   * @param {ListPushTaskDto} query
   * @return
   */
  async findAllPushTask(query: ListPushTaskDto) {
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
      this.tasksService.startCronJob(`nodemailer_push${item.pushtaskId}`);
    } else {
      this.tasksService.stopCronJob(`nodemailer_push${item.pushtaskId}`);
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
      this.tasksService.deleteCron(`nodemailer_push${res.pushtaskId}`);
    }
    return ResultData.ok();
  }
}
