import { Module } from "@nestjs/common";
import { PluginsModule } from "@/plugins/plugins.module";
import { SalarySlipController } from "./salary-slip.controller";
import { SalarySlipService } from "./salary-slip.service";

@Module({
  imports: [PluginsModule],
  controllers: [SalarySlipController],
  providers: [SalarySlipService]
})
export class SalarySlipModule {}
