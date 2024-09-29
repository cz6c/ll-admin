import { Controller, Get, Param, Delete } from '@nestjs/common';
import { OperlogService } from './operlog.service';

@Controller('monitor/operlog')
export class OperlogController {
  constructor(private readonly operlogService: OperlogService) {}

  @Get()
  findAll() {
    return this.operlogService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.operlogService.findOne(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.operlogService.remove(+id);
  }
}
