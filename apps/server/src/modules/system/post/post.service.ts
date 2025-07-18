import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { ResultData } from "@/common/utils/result";
import { ExportTable } from "@/common/utils/export";
import { SysPostEntity } from "./entities/post.entity";
import type { Response as ExpressResponse } from "express";
import { CreatePostDto, UpdatePostDto, ListPostDto } from "./dto/index";
import { DelFlagEnum } from "@/common/enum/dict";

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(SysPostEntity)
    private readonly sysPostEntityRep: Repository<SysPostEntity>
  ) {}

  /**
   * @description: 创建岗位
   * @param {CreatePostDto} createPostDto
   * @param {number} userId
   * @return
   */
  async create(createPostDto: CreatePostDto, userId: number) {
    await this.sysPostEntityRep.save({ ...createPostDto, createBy: userId });
    return ResultData.ok();
  }

  /**
   * @description: 岗位管理-列表
   * @param {ListPostDto} query
   * @return
   */
  async findAll(query: ListPostDto) {
    const entity = this.sysPostEntityRep.createQueryBuilder("entity");
    entity.where("entity.delFlag = :delFlag", { delFlag: DelFlagEnum.NORMAL });

    if (query.postName) {
      entity.andWhere(`entity.postName LIKE "%${query.postName}%"`);
    }

    if (query.postCode) {
      entity.andWhere(`entity.postCode LIKE "%${query.postCode}%"`);
    }

    if (query.status) {
      entity.andWhere("entity.status = :status", { status: query.status });
    }
    entity.orderBy("entity.postSort", "ASC");

    if (query.pageSize && query.pageNum) {
      entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    }

    const [list, total] = await entity.getManyAndCount();

    return ResultData.ok({
      list,
      total
    });
  }

  /**
   * @description: 岗位管理-详情
   * @param {number} postId
   * @return
   */
  async findOne(postId: number) {
    const res = await this.sysPostEntityRep.findOne({
      where: {
        postId: postId,
        delFlag: DelFlagEnum.NORMAL
      }
    });
    return ResultData.ok(res);
  }

  /**
   * @description: 岗位管理-更新
   * @param {UpdatePostDto} updatePostDto
   * @param {number} userId
   * @return
   */
  async update(updatePostDto: UpdatePostDto, userId: number) {
    await this.sysPostEntityRep.update({ postId: updatePostDto.postId }, { ...updatePostDto, updateBy: userId });
    return ResultData.ok();
  }

  /**
   * @description: 岗位管理-删除
   * @param {number} postIds
   * @param {number} userId
   * @return
   */
  async remove(postIds: number[], userId: number) {
    await this.sysPostEntityRep.update(
      { postId: In(postIds) },
      {
        delFlag: DelFlagEnum.DELETE,
        updateBy: userId
      }
    );
    return ResultData.ok();
  }

  /**
   * 导出岗位管理数据为xlsx文件
   * @param res
   */
  async export(res: ExpressResponse, body: ListPostDto) {
    delete body.pageNum;
    delete body.pageSize;
    const list = await this.findAll(body);
    const options = {
      sheetName: "岗位数据",
      data: list.data.list,
      header: [
        { title: "岗位序号", dataIndex: "postId" },
        { title: "岗位编码", dataIndex: "postCode" },
        { title: "岗位名称", dataIndex: "postName" },
        { title: "岗位排序", dataIndex: "postSort" },
        { title: "状态", dataIndex: "status" }
      ]
    };
    await ExportTable(options, res);
  }
}
