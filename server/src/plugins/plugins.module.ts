import { Module } from '@nestjs/common';
import { AxiosService } from './axios.service';
import { MqttService } from './mqtt.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [AxiosService, MqttService],
  exports: [AxiosService, MqttService],
})
export class PluginsModule {}
