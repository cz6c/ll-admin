import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import { Repository, In, Not, IsNull } from 'typeorm';
import { ResultData } from '@/common/utils/result';
import { ExportTable } from '@/common/utils/export';
import { MonitorLoginlogEntity } from './entities/loginlog.entity';
import { CreateLoginlogDto, ListLoginlogDto } from './dto/index';
import { DelFlagEnum } from '@/common/enum';

@Injectable()
export class LoginlogService {
  constructor(
    @InjectRepository(MonitorLoginlogEntity)
    private readonly monitorLoginlogEntityRep: Repository<MonitorLoginlogEntity>,
  ) {}

  /**
   * 创建用户登录日志
   * @param createLoginlogDto
   * @returns
   */
  async create(createLoginlogDto: CreateLoginlogDto) {
    return await this.monitorLoginlogEntityRep.save(createLoginlogDto);
  }

  /**
   * 日志列表-分页
   * @param query
   * @returns
   */
  async findAll(query: ListLoginlogDto) {
    const entity = this.monitorLoginlogEntityRep.createQueryBuilder('entity');
    entity.where('entity.delFlag = :delFlag', { delFlag: DelFlagEnum.NORMAL });

    if (query.ipaddr) {
      entity.andWhere(`entity.ipaddr LIKE "%${query.ipaddr}%"`);
    }

    if (query.userName) {
      entity.andWhere(`entity.userName LIKE "%${query.userName}%"`);
    }

    if (query.status) {
      entity.andWhere('entity.status = :status', { status: query.status });
    }

    if (query?.beginTime && query?.endTime) {
      entity.andWhere('entity.loginTime BETWEEN :start AND :end', { start: query.beginTime, end: query.endTime });
    }

    if (query.orderByColumn && query.order) {
      const key = query.order === 'ascending' ? 'ASC' : 'DESC';
      entity.orderBy(`entity.${query.orderByColumn}`, key);
    }

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
   * 删除日志
   * @returns
   */
  async remove(ids: string[]) {
    const data = await this.monitorLoginlogEntityRep.update(
      { infoId: In(ids) },
      {
        delFlag: DelFlagEnum.DELETE,
      },
    );
    return ResultData.ok(data);
  }

  /**
   * 删除全部日志
   * @returns
   */
  async removeAll() {
    await this.monitorLoginlogEntityRep.update(
      { infoId: Not(IsNull()) },
      {
        delFlag: DelFlagEnum.DELETE,
      },
    );
    return ResultData.ok();
  }

  /**
   * 导出登录日志数据为xlsx
   * @param res
   */
  async export(res: Response, body: ListLoginlogDto) {
    delete body.pageNum;
    delete body.pageSize;
    const list = await this.findAll(body);
    const options = {
      sheetName: '登录日志',
      data: list.data.list,
      header: [
        { title: '序号', dataIndex: 'infoId' },
        { title: '用户账号', dataIndex: 'userName' },
        { title: '登录状态', dataIndex: 'status' },
        { title: '登录地址', dataIndex: 'ipaddr' },
        { title: '登录地点', dataIndex: 'loginLocation' },
        { title: '浏览器', dataIndex: 'browser' },
        { title: '操作系统', dataIndex: 'os' },
        { title: '提示消息', dataIndex: 'msg' },
        { title: '访问时间', dataIndex: 'loginTime' },
      ],
    };
    ExportTable(options, res);
  }
}
