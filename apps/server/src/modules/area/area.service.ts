import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResultData } from '@/common/utils/result';
import { AreaEntity, CityEntity, ProvinceEntity } from './entities/area.entity';
import { AeraListParamsDto } from './dto/index.dto';
import { listToTree } from '@/common/utils/tree';

@Injectable()
export class AreaService {
  constructor(
    @InjectRepository(AreaEntity)
    private readonly areaRepository: Repository<AreaEntity>,
    @InjectRepository(CityEntity)
    private readonly cityRepository: Repository<CityEntity>,
    @InjectRepository(ProvinceEntity)
    private readonly provinceRepository: Repository<ProvinceEntity>,
  ) {}

  // trees列表
  async findTrees() {
    const provinceList = (await this.provinceRepository.find()).map((c) => ({
      name: c.name,
      code: c.code,
      parentCode: null,
    }));
    const cityList = (await this.cityRepository.find()).map((c) => ({
      name: c.name,
      code: c.code,
      parentCode: c.provinceCode,
    }));
    const areaList = (await this.areaRepository.find()).map((c) => ({
      name: c.name,
      code: c.code,
      parentCode: c.cityCode,
    }));
    return ResultData.ok(
      listToTree([...provinceList, ...cityList, ...areaList], {
        pid: 'parentCode',
        id: 'code',
      }),
    );
  }

  // 通过code和层级查子级地址列表
  async findAllChildrenByCode(params: AeraListParamsDto) {
    if (params.level === 1) {
      const list = await this.provinceRepository.find();
      return ResultData.ok(list);
    }
    if (params.level === 2) {
      const list = await this.cityRepository.find({
        where: { provinceCode: params.code },
      });
      return ResultData.ok(list);
    }
    if (params.level === 3) {
      const list = await this.areaRepository.find({
        where: { cityCode: params.code },
      });
      return ResultData.ok(list);
    }
  }
}
