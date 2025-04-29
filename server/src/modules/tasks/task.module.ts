import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { TaskEntity } from './entities/task.entity';
import { BullModule } from '@nestjs/bull';
import { PluginsModule } from '@/plugins/plugins.module';
import { LocalTask } from './task.local';
import { TaskProcessor } from './task.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskEntity]),
    // 注册队列
    BullModule.registerQueueAsync({
      name: 'tasks',
    }),
    PluginsModule,
  ],
  controllers: [TaskController],
  providers: [TaskService, LocalTask, TaskProcessor],
  exports: [TaskService, LocalTask, TaskProcessor],
})
export class TaskModule {}
