import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1795488496284 implements MigrationInterface {
    name = 'Migration1795488496284'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_blind_operation\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_chassis_solidity\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_handling\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_high_speed_stability\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_quietness\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_seating_visibility\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_power_response\` decimal(2,1) NOT NULL COMMENT '动力响应与平顺性 0.5-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_chassis_control\` decimal(2,1) NOT NULL COMMENT '底盘滤震与车身控制 0.5-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_steering_braking\` decimal(2,1) NOT NULL COMMENT '转向与制动 0.5-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_nvh_posture\` decimal(2,1) NOT NULL COMMENT 'NVH与驾驶坐姿 0.5-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_hmi_adas\` decimal(2,1) NOT NULL COMMENT '驾驶相关人机与辅助驾驶 0.5-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_energy_range\` decimal(2,1) NOT NULL COMMENT '能耗/续航与补能 0.5-5'`);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`use_inferred_for_cumulative\` \`use_inferred_for_cumulative\` tinyint(1) NOT NULL COMMENT '是否用反推应发参与后续累计预扣' DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`use_inferred_for_cumulative\` \`use_inferred_for_cumulative\` tinyint NOT NULL COMMENT '是否用反推应发参与后续累计预扣' DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_energy_range\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_hmi_adas\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_nvh_posture\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_steering_braking\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_chassis_control\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_power_response\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_seating_visibility\` decimal(2,1) NOT NULL COMMENT '坐姿与视野 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_quietness\` decimal(2,1) NOT NULL COMMENT '静谧性 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_high_speed_stability\` decimal(2,1) NOT NULL COMMENT '高速稳定性 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_handling\` decimal(2,1) NOT NULL COMMENT '操控感 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_chassis_solidity\` decimal(2,1) NOT NULL COMMENT '底盘厚重感 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_blind_operation\` decimal(2,1) NOT NULL COMMENT '盲操便利性 0.5-5 半分'`);
    }

}
