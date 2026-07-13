import type { MigrationInterface, QueryRunner } from "typeorm";

export class SalaryVerifyHistory1762500000000 implements MigrationInterface {
  name = "SalaryVerifyHistory1762500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`c_user\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
        \`openid\` varchar(128) NOT NULL COMMENT '微信 openid',
        \`recognize_count\` int NOT NULL DEFAULT '0' COMMENT '识别成功次数',
        \`status\` enum ('0', '1') NOT NULL DEFAULT '0' COMMENT '状态',
        \`del_flag\` enum ('0', '1') NOT NULL DEFAULT '0' COMMENT '删除标志',
        \`create_by\` int NULL COMMENT '创建者',
        \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
        \`update_by\` int NULL COMMENT '更新者',
        \`update_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
        UNIQUE INDEX \`UQ_c_user_openid\` (\`openid\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB COMMENT='薪资识别微信用户表'`
    );

    await queryRunner.query(
      `CREATE TABLE \`salary_verify_history\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
        \`c_user_id\` int NOT NULL COMMENT '微信用户ID',
        \`pay_period\` varchar(7) NOT NULL COMMENT '工资所属月份 YYYY-MM',
        \`pre_tax_monthly\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '税前工资',
        \`ss_personal_amount\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '个人社保',
        \`hf_personal_amount\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '个人公积金',
        \`special_deduction_monthly\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '专项附加扣除',
        \`personal_income_tax\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '个税',
        \`post_tax_monthly\` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '税后工资',
        \`saved_at\` bigint NOT NULL DEFAULT '0' COMMENT '前端保存时间戳（毫秒）',
        \`status\` enum ('0', '1') NOT NULL DEFAULT '0' COMMENT '状态',
        \`del_flag\` enum ('0', '1') NOT NULL DEFAULT '0' COMMENT '删除标志',
        \`create_by\` int NULL COMMENT '创建者',
        \`create_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '创建时间',
        \`update_by\` int NULL COMMENT '更新者',
        \`update_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT '更新时间',
        UNIQUE INDEX \`idx_salary_verify_history_user_period\` (\`c_user_id\`, \`pay_period\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_salary_verify_history_c_user\` FOREIGN KEY (\`c_user_id\`) REFERENCES \`c_user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB COMMENT='月薪核对历史表'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`salary_verify_history\``);
    await queryRunner.query(`DROP TABLE \`c_user\``);
  }
}
