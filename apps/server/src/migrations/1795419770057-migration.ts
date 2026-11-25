import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1795419770057 implements MigrationInterface {
    name = 'Migration1795419770057'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`use_inferred_for_cumulative\` \`use_inferred_for_cumulative\` tinyint(1) NOT NULL COMMENT '是否用反推应发参与后续累计预扣' DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_chassis_solidity\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_chassis_solidity\` decimal(2,1) NOT NULL COMMENT '底盘厚重感 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_handling\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_handling\` decimal(2,1) NOT NULL COMMENT '操控感 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_high_speed_stability\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_high_speed_stability\` decimal(2,1) NOT NULL COMMENT '高速稳定性 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_quietness\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_quietness\` decimal(2,1) NOT NULL COMMENT '静谧性 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_seating_visibility\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_seating_visibility\` decimal(2,1) NOT NULL COMMENT '坐姿与视野 0.5-5 半分'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_blind_operation\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_blind_operation\` decimal(2,1) NOT NULL COMMENT '盲操便利性 0.5-5 半分'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_blind_operation\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_blind_operation\` tinyint NOT NULL COMMENT '盲操便利性 1-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_seating_visibility\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_seating_visibility\` tinyint NOT NULL COMMENT '坐姿与视野 1-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_quietness\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_quietness\` tinyint NOT NULL COMMENT '静谧性 1-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_high_speed_stability\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_high_speed_stability\` tinyint NOT NULL COMMENT '高速稳定性 1-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_handling\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_handling\` tinyint NOT NULL COMMENT '操控感 1-5'`);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` DROP COLUMN \`score_chassis_solidity\``);
        await queryRunner.query(`ALTER TABLE \`drive_score_record\` ADD \`score_chassis_solidity\` tinyint NOT NULL COMMENT '底盘厚重感 1-5'`);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`use_inferred_for_cumulative\` \`use_inferred_for_cumulative\` tinyint NOT NULL COMMENT '是否用反推应发参与后续累计预扣' DEFAULT '0'`);
    }

}
