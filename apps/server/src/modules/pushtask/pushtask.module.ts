import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushTaskService } from './pushtask.service';
import { TaskModule } from '@/modules/tasks/task.module';
import { PushTaskEntity } from './entities/pushtask.entity';
import { PushTaskController } from './pushtask.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PushTaskEntity]), TaskModule],
  controllers: [PushTaskController],
  providers: [PushTaskService],
  exports: [PushTaskService],
})
export class PushTaskModule {}
