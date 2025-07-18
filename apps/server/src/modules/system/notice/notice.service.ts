import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { ResultData } from "@/common/utils/result";
import { SysNoticeEntity } from "./entities/notice.entity";
import { CreateNoticeDto, UpdateNoticeDto, ListNoticeDto } from "./dto/index";
import { DelFlagEnum } from "@/common/enum/dict";

@Injectable()
export class NoticeService {
  constructor(
    @InjectRepository(SysNoticeEntity)
    private readonly sysNoticeEntityRep: Repository<SysNoticeEntity>
  ) {}

  /**
   * @description: 通知公告-创建
   * @param {CreateNoticeDto} createNoticeDto
   * @param {number} userId
   * @return
   */
  async create(createNoticeDto: CreateNoticeDto, userId: number) {
    await this.sysNoticeEntityRep.save({
      ...createNoticeDto,
      createBy: userId
    });
    return ResultData.ok();
  }

  /**
   * @description: 通知公告-列表
   * @param {ListNoticeDto} query
   * @return
   */
  async findAll(query: ListNoticeDto) {
    const entity = this.sysNoticeEntityRep.createQueryBuilder("entity");
    entity.where("entity.delFlag = :delFlag", { delFlag: DelFlagEnum.NORMAL });

    if (query.noticeTitle) {
      entity.andWhere(`entity.noticeTitle LIKE "%${query.noticeTitle}%"`);
    }

    if (query.createBy) {
      entity.andWhere(`entity.createBy LIKE "%${query.createBy}%"`);
    }

    if (query.noticeType) {
      entity.andWhere("entity.noticeType = :noticeType", {
        noticeType: query.noticeType
      });
    }

    if (query?.beginTime && query?.endTime) {
      entity.andWhere("entity.createTime BETWEEN :start AND :end", {
        start: query.beginTime,
        end: query.endTime
      });
    }

    entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    const [list, total] = await entity.getManyAndCount();

    return ResultData.ok({
      list,
      total
    });
  }

  /**
   * @description: 通知公告-详情
   * @param {number} noticeId
   * @return
   */
  async findOne(noticeId: number) {
    const data = await this.sysNoticeEntityRep.findOne({
      where: {
        noticeId: noticeId
      }
    });
    return ResultData.ok(data);
  }

  /**
   * @description: 通知公告-更新
   * @param {UpdateNoticeDto} updateNoticeDto
   * @param {number} userId
   * @return
   */
  async update(updateNoticeDto: UpdateNoticeDto, userId: number) {
    await this.sysNoticeEntityRep.update(
      {
        noticeId: updateNoticeDto.noticeId
      },
      { ...updateNoticeDto, updateBy: userId }
    );
    return ResultData.ok();
  }

  /**
   * @description: 通知公告-删除
   * @param {number} noticeIds
   * @param {number} userId
   * @return
   */
  async remove(noticeIds: number[], userId: number) {
    await this.sysNoticeEntityRep.update(
      { noticeId: In(noticeIds) },
      {
        delFlag: DelFlagEnum.DELETE,
        updateBy: userId
      }
    );
    return ResultData.ok();
  }
}
