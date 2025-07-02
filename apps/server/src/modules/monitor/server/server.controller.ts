import { Controller, Get } from '@nestjs/common';
import { ServerService } from './server.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('monitor')
@ApiBearerAuth()
@Controller('monitor/server')
export class ServerController {
  constructor(private readonly serverService: ServerService) {}

  @ApiOperation({ summary: '服务器信息' })
  @Get()
  getInfo() {
    return this.serverService.getInfo();
  }
}
