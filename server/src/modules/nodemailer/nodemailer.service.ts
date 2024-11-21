import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ResultData } from '@/common/utils/result';
import { NodemailerPushTaskEntity } from './entities/nodemailer.pushtask.entity';
import { NodemailerPushLogEntity } from './entities/nodemailer.pushlog.entity';
import { CreateNodemailerPushTaskDto, UpdateNodemailerPushTaskDto, ListNodemailerPushTaskDto } from './dto/index';
import { DelFlagEnum, StatusEnum } from '@/common/enum';
import { TaskService } from '../task/task.service';
import { CronExpression } from '@nestjs/schedule';

@Injectable()
export class NodemailerService {
  constructor(
    @InjectRepository(NodemailerPushTaskEntity)
    private readonly nodemailerPushTaskEntity: Repository<NodemailerPushTaskEntity>,
    @InjectRepository(NodemailerPushLogEntity)
    private readonly nodemailerPushLogEntity: Repository<NodemailerPushLogEntity>,
    private readonly taskService: TaskService,
  ) {}

  async createPushTask(createNodemailerPushTaskDto: CreateNodemailerPushTaskDto) {
    await this.nodemailerPushTaskEntity.save(createNodemailerPushTaskDto);
    // todo
    // 注册定时任务发送邮件
    if (createNodemailerPushTaskDto.status === StatusEnum.NORMAL) {
      this.taskService.registerTask(createNodemailerPushTaskDto.pushtaskName, CronExpression.EVERY_10_SECONDS, () => {});
    }
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
    // todo
    // 开启定时任务发送邮件
    if (updateNodemailerPushTaskDto.status === StatusEnum.NORMAL) {
      this.taskService.registerTask(updateNodemailerPushTaskDto.pushtaskName, CronExpression.EVERY_10_SECONDS, () => {});
    } else {
      // 关闭定时任务
      this.taskService.registerTask(updateNodemailerPushTaskDto.pushtaskName, CronExpression.EVERY_10_SECONDS, () => {});
    }
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
        where: {
          pushtaskId: id,
          delFlag: DelFlagEnum.NORMAL,
        },
      });
      // todo
      this.taskService.registerTask(res.pushtaskName, CronExpression.EVERY_10_SECONDS, () => {});
    }
    return ResultData.ok(data);
  }
}
