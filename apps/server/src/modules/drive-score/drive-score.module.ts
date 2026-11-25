import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DriveScoreController } from "./drive-score.controller";
import { DriveScoreService } from "./drive-score.service";
import { DriveScoreRecordEntity } from "./entities/drive-score-record.entity";

@Module({
  imports: [TypeOrmModule.forFeature([DriveScoreRecordEntity])],
  controllers: [DriveScoreController],
  providers: [DriveScoreService]
})
export class DriveScoreModule {}
