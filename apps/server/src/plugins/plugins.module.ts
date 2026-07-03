import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AxiosService } from "./axios.service";
import { ImagePreprocessService } from "./image-preprocess.service";
import { MqttService } from "./mqtt.service";
import { NodemailerService } from "./nodemailer.service";
import { OcrService } from "./ocr.service";
import { OpenAIService } from "./openai.service";

@Module({
  imports: [HttpModule],
  providers: [AxiosService, ImagePreprocessService, MqttService, NodemailerService, OcrService, OpenAIService],
  exports: [AxiosService, ImagePreprocessService, MqttService, NodemailerService, OcrService, OpenAIService]
})
export class PluginsModule {}
