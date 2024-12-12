import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ResultData } from '@/common/utils/result';
import { ExportTable } from '@/common/utils/export';
import { CreateConfigDto, UpdateConfigDto, ListConfigDto } from './dto/index';
import { SysConfigEntity } from './entities/config.entity';
import { DelFlagEnum, YesNoEnum } from '@/common/enum/dict';

@Injectable()
export class ConfigService {
  constructor(
    @InjectRepository(SysConfigEntity)
    private readonly sysConfigEntityRep: Repository<SysConfigEntity>,
  ) {}

  /**
   * @description: 参数设置-创建
   * @param {CreateConfigDto} createConfigDto
   * @return
   */
  async create(createConfigDto: CreateConfigDto) {
    await this.sysConfigEntityRep.save(createConfigDto);
    return ResultData.ok();
  }

  /**
   * @description: 参数设置-列表
   * @param {ListConfigDto} query
   * @return
   */
  async findAll(query: ListConfigDto) {
    const entity = this.sysConfigEntityRep.createQueryBuilder('entity');
    entity.where('entity.delFlag = :delFlag', { delFlag: DelFlagEnum.NORMAL });

    if (query.configName) {
      entity.andWhere(`entity.configName LIKE "%${query.configName}%"`);
    }

    if (query.configKey) {
      entity.andWhere(`entity.configKey LIKE "%${query.configKey}%"`);
    }

    if (query.configType) {
      entity.andWhere('entity.configType = :configType', { configType: query.configType });
    }

    if (query?.beginTime && query?.endTime) {
      entity.andWhere('entity.createTime BETWEEN :start AND :end', { start: query.beginTime, end: query.endTime });
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
   * @description: 参数设置-详情(id)
   * @param {number} configId
   * @return
   */
  async findOne(configId: number) {
    const data = await this.sysConfigEntityRep.findOne({
      where: {
        configId: configId,
      },
    });
    return ResultData.ok(data);
  }

  /**
   * @description: 参数设置-更新
   * @param {UpdateConfigDto} updateConfigDto
   * @return
   */
  async update(updateConfigDto: UpdateConfigDto) {
    await this.sysConfigEntityRep.update(
      {
        configId: updateConfigDto.configId,
      },
      updateConfigDto,
    );
    return ResultData.ok();
  }

  /**
   * @description: 参数设置-删除
   * @param {number} configIds
   * @return
   */
  async remove(configIds: number[]) {
    const list = await this.sysConfigEntityRep.find({
      where: {
        configId: In(configIds),
        delFlag: DelFlagEnum.NORMAL,
      },
      select: ['configType', 'configKey'],
    });
    const item = list.find((item) => item.configType === YesNoEnum.YES);
    if (item) {
      return ResultData.fail(500, `内置参数【${item.configKey}】不能删除`);
    }
    await this.sysConfigEntityRep.update(
      { configId: In(configIds) },
      {
        delFlag: DelFlagEnum.DELETE,
      },
    );
    return ResultData.ok();
  }

  /**
   * 导出参数管理数据为xlsx
   * @param res
   */
  async export(res: Response, body: ListConfigDto) {
    delete body.pageNum;
    delete body.pageSize;
    const list = await this.findAll(body);
    const options = {
      sheetName: '参数管理',
      data: list.data.list,
      header: [
        { title: '参数主键', dataIndex: 'configId' },
        { title: '参数名称', dataIndex: 'configName' },
        { title: '参数键名', dataIndex: 'configKey' },
        { title: '参数键值', dataIndex: 'configValue' },
        { title: '系统内置', dataIndex: 'configType' },
      ],
      dictMap: {
        configType: {
          Y: '是',
          N: '否',
        },
      },
    };
    ExportTable(options, res);
  }

  /**
   * @description: 参数设置-详情(key)
   * @param {string} configKey
   * @return
   */
  async getConfigValue(configKey: string) {
    const data = await this.sysConfigEntityRep.findOne({
      where: {
        configKey: configKey,
      },
      select: ['configValue', 'configKey'],
    });
    return data?.configValue;
  }
}
