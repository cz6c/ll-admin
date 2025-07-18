import { Module } from "@nestjs/common";
import { AreaService } from "./area.service";
import { AreaController } from "./area.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AreaEntity, CityEntity, ProvinceEntity } from "./entities/area.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ProvinceEntity, CityEntity, AreaEntity])],
  controllers: [AreaController],
  providers: [AreaService]
})
export class AreaModule {}
