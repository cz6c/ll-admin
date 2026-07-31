import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AxiosService } from "./axios.service";
import { ImagePreprocessService } from "./image-preprocess.service";
import { MqttService } from "./mqtt.service";
import { NodemailerService } from "./nodemailer.service";
import { OcrModule } from "./ocr/ocr.module";
import { VlmModule } from "./vlm/vlm.module";
import { WechatService } from "./wechat.service";

/**
 * 通用插件聚合：OCR / VLM 为独立子模块，业务按需注入能力门面
 */
@Module({
  imports: [HttpModule, OcrModule, VlmModule],
  providers: [AxiosService, ImagePreprocessService, MqttService, NodemailerService, WechatService],
  exports: [AxiosService, ImagePreprocessService, MqttService, NodemailerService, WechatService, OcrModule, VlmModule]
})
export class PluginsModule {}
