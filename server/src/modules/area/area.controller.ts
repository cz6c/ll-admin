import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AreaService } from './area.service';
import { AeraListParamsDto, AeraVO } from './dto/index.dto';
import { ApiResult } from '@/common/decorator';

@ApiTags('通用')
@Controller('common/area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @ApiOperation({ summary: '通过 code 查area列表' })
  @ApiResult(AeraVO, true)
  @Get('list')
  async findAllChildrenByCode(@Query() params: AeraListParamsDto) {
    return await this.areaService.findAllChildrenByCode(params);
  }

  @ApiOperation({ summary: 'area trees' })
  @Get('trees')
  async findTrees() {
    return await this.areaService.findTrees();
  }
}
