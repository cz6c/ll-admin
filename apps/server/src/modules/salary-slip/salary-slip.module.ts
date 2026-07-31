import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PluginsModule } from "@/plugins/plugins.module";
import { UserEntity } from "@/modules/system/user/entities/user.entity";
import { SalarySlipController } from "./salary-slip.controller";
import { SalarySlipService } from "./salary-slip.service";
import { SalaryVerifyHistoryEntity } from "./entities/salary-verify-history.entity";
import { OcrRecognizeStrategy } from "./recognize/ocr-recognize.strategy";
import { SalarySlipRecognizeOrchestrator } from "./recognize/salary-slip-recognize.orchestrator";
import { VlmRecognizeStrategy } from "./recognize/vlm-recognize.strategy";

@Module({
  imports: [PluginsModule, TypeOrmModule.forFeature([UserEntity, SalaryVerifyHistoryEntity])],
  controllers: [SalarySlipController],
  providers: [SalarySlipService, SalarySlipRecognizeOrchestrator, OcrRecognizeStrategy, VlmRecognizeStrategy]
})
export class SalarySlipModule {}
