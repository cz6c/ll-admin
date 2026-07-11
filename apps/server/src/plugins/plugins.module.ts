import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AxiosService } from "./axios.service";
import { ImagePreprocessService } from "./image-preprocess.service";
import { MqttService } from "./mqtt.service";
import { NodemailerService } from "./nodemailer.service";
import { OcrService } from "./ocr.service";
import { QwenOcrProvider } from "./ocr/qwen-ocr.provider";
import { RapidOcrProvider } from "./ocr/rapid-ocr.provider";
import { WechatService } from "./wechat.service";

@Module({
  imports: [HttpModule],
  providers: [AxiosService, ImagePreprocessService, MqttService, NodemailerService, QwenOcrProvider, RapidOcrProvider, OcrService, WechatService],
  exports: [AxiosService, ImagePreprocessService, MqttService, NodemailerService, OcrService, WechatService]
})
export class PluginsModule {}
