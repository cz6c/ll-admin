import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushTaskService } from './nodemailer.service';
import { NodemailerController } from './nodemailer.controller';
import { NodemailerPushTaskEntity } from './entities/nodemailer.pushtask.entity';
import { NodemailerPushLogEntity } from './entities/nodemailer.pushlog.entity';
import { TaskModule } from '@/modules/tasks/task.module';

@Module({
  imports: [TypeOrmModule.forFeature([NodemailerPushTaskEntity, NodemailerPushLogEntity]), TaskModule],
  controllers: [NodemailerController],
  providers: [PushTaskService],
  exports: [PushTaskService],
})
export class NodemailerModule {}
