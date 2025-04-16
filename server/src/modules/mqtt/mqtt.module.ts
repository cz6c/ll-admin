import { Module } from '@nestjs/common';
import { RedisLockService } from './redis-lock.service';
import { MqttService } from './mqtt.service';

@Module({
  providers: [RedisLockService, MqttService],
})
export class MqttModule {}
