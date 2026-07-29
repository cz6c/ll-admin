import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 删除 sys_user.recognize_count：日限流已迁 Redis，核对次数改走历史表
 */
export class DropSysUserRecognizeCount1764400000000 implements MigrationInterface {
  name = "DropSysUserRecognizeCount1764400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("sys_user"))) {
      return;
    }
    if (!(await queryRunner.hasColumn("sys_user", "recognize_count"))) {
      return;
    }
    await queryRunner.query("ALTER TABLE `sys_user` DROP COLUMN `recognize_count`");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("sys_user"))) {
      return;
    }
    if (await queryRunner.hasColumn("sys_user", "recognize_count")) {
      return;
    }
    await queryRunner.query(
      "ALTER TABLE `sys_user` ADD `recognize_count` int NOT NULL DEFAULT 0 COMMENT '识别成功次数' AFTER `openid`"
    );
  }
}
