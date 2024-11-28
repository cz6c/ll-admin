import { Module } from '@nestjs/common';
import { AxiosService } from './axios.service';
import { EmailService } from './email.service';
import { TaskService } from './task.service';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [HttpModule, ScheduleModule.forRoot()],
  providers: [AxiosService, EmailService, TaskService],
  exports: [AxiosService, EmailService, TaskService],
})
export class PluginsModule {}
