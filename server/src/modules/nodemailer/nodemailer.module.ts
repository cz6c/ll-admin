import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodemailerService } from './nodemailer.service';
import { NodemailerController } from './nodemailer.controller';
import { NodemailerPushTaskEntity } from './entities/nodemailer.pushtask.entity';
import { NodemailerPushLogEntity } from './entities/nodemailer.pushlog.entity';
import { PluginsModule } from '@/plugins/plugins.module';

@Module({
  imports: [TypeOrmModule.forFeature([NodemailerPushTaskEntity, NodemailerPushLogEntity]), PluginsModule],
  controllers: [NodemailerController],
  providers: [NodemailerService],
})
export class NodemailerModule {}
