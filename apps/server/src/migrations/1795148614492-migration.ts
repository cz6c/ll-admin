import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1795148614492 implements MigrationInterface {
    name = 'Migration1795148614492'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`UQ_sys_user_openid\` ON \`sys_user\``);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` COMMENT '薪资历史表（月薪核对/年薪测算）'`);
        await queryRunner.query(`CREATE TABLE \`drive_score_record\` (\`status\` enum ('0', '1') NOT NULL COMMENT '状态' DEFAULT '0', \`del_flag\` enum ('0', '1') NOT NULL COMMENT '删除标志' DEFAULT '0', \`create_by\` int NULL COMMENT '创建者', \`create_time\` datetime(6) NULL COMMENT '创建时间' DEFAULT CURRENT_TIMESTAMP(6), \`update_by\` int NULL COMMENT '更新者', \`update_time\` datetime(6) NULL COMMENT '更新时间' DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`drive_score_id\` int NOT NULL AUTO_INCREMENT COMMENT '主键ID', \`user_id\` int NOT NULL COMMENT '用户ID', \`vehicle_name\` varchar(64) NOT NULL COMMENT '车辆名称/型号', \`remark\` varchar(255) NULL COMMENT '备注', \`score_chassis_solidity\` tinyint NOT NULL COMMENT '底盘厚重感 1-5', \`score_handling\` tinyint NOT NULL COMMENT '操控感 1-5', \`score_high_speed_stability\` tinyint NOT NULL COMMENT '高速稳定性 1-5', \`score_quietness\` tinyint NOT NULL COMMENT '静谧性 1-5', \`score_seating_visibility\` tinyint NOT NULL COMMENT '坐姿与视野 1-5', \`score_blind_operation\` tinyint NOT NULL COMMENT '盲操便利性 1-5', INDEX \`idx_drive_score_record_user_list\` (\`user_id\`, \`del_flag\`), PRIMARY KEY (\`drive_score_id\`)) ENGINE=InnoDB COMMENT="试驾体验打分记录"`);
        await queryRunner.query(`ALTER TABLE \`sys_user\` CHANGE \`openid\` \`openid\` varchar(128) NULL COMMENT '微信 openid'`);
        await queryRunner.query(`ALTER TABLE \`sys_user\` ADD UNIQUE INDEX \`IDX_67b56059be47a7fa6b7a6b71c9\` (\`openid\`)`);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`create_time\` \`create_time\` datetime(6) NULL COMMENT '创建时间' DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`update_time\` \`update_time\` datetime(6) NULL COMMENT '更新时间' DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`use_inferred_for_cumulative\` \`use_inferred_for_cumulative\` tinyint(1) NOT NULL COMMENT '是否用反推应发参与后续累计预扣' DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`use_inferred_for_cumulative\` \`use_inferred_for_cumulative\` tinyint NOT NULL COMMENT '是否用反推应发参与后续累计预扣' DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`update_time\` \`update_time\` datetime(6) NOT NULL COMMENT '更新时间' DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` CHANGE \`create_time\` \`create_time\` datetime(6) NOT NULL COMMENT '创建时间' DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`sys_user\` DROP INDEX \`IDX_67b56059be47a7fa6b7a6b71c9\``);
        await queryRunner.query(`ALTER TABLE \`sys_user\` CHANGE \`openid\` \`openid\` varchar(128) COLLATE "utf8mb4_general_ci" NULL COMMENT '微信 openid'`);
        await queryRunner.query(`DROP INDEX \`idx_drive_score_record_user_list\` ON \`drive_score_record\``);
        await queryRunner.query(`DROP TABLE \`drive_score_record\``);
        await queryRunner.query(`ALTER TABLE \`salary_verify_history\` COMMENT '工资核对历史表'`);
        await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_sys_user_openid\` ON \`sys_user\` (\`openid\`)`);
    }

}
