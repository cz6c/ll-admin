import { Module } from '@nestjs/common';
import { MainService } from './main.service';
import { MainController } from './main.controller';
import { PluginsModule } from '@/plugins/plugins.module';

@Module({
  imports: [PluginsModule],
  controllers: [MainController],
  providers: [MainService],
})
export class MainModule {}
