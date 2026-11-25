import { MigrationInterface, QueryRunner } from "typeorm";

/** 试驾备注支持完整三档选项模版（500 字） */
export class Migration1795604580000 implements MigrationInterface {
  name = "Migration1795604580000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`drive_score_record\` CHANGE \`remark\` \`remark\` varchar(500) NULL COMMENT '备注'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`drive_score_record\` CHANGE \`remark\` \`remark\` varchar(255) NULL COMMENT '备注'`,
    );
  }
}