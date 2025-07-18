import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AxiosService } from "./axios.service";
import { MqttService } from "./mqtt.service";
import { NodemailerService } from "./nodemailer.service";

@Module({
  imports: [HttpModule],
  providers: [AxiosService, MqttService, NodemailerService],
  exports: [AxiosService, MqttService, NodemailerService]
})
export class PluginsModule {}
