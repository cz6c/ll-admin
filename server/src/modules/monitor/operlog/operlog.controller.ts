import { Controller } from '@nestjs/common';
import { OperlogService } from './operlog.service';

@Controller('monitor/operlog')
export class OperlogController {
  constructor(private readonly operlogService: OperlogService) {}
}
