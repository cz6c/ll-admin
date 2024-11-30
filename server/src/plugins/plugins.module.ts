import { Module } from '@nestjs/common';
import { AxiosService } from './axios.service';
import { TaskService } from './task.service';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { NodemailerModule } from '@/modules/nodemailer/nodemailer.module';

@Module({
  imports: [HttpModule, ScheduleModule.forRoot(), NodemailerModule],
  providers: [AxiosService, TaskService],
  exports: [AxiosService, TaskService],
})
export class PluginsModule {}