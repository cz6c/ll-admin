import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AreaService } from './area.service';
import { AeraListParamsDto, AeraTreeVO, AeraVO } from './dto/index.dto';
import { ApiResult } from '@/common/decorator';

@ApiTags('common')
@ApiBearerAuth()
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
  @ApiResult(AeraTreeVO, true)
  @Get('trees')
  async findTrees() {
    return await this.areaService.findTrees();
  }
}
