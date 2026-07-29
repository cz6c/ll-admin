import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * sys_user 增加拉新渠道来源 source（微信首次归因；新建写入，空则补写一次）
 */
export class SysUserSource1764300000000 implements MigrationInterface {
  name = "SysUserSource1764300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("sys_user"))) {
      return;
    }
    if (await queryRunner.hasColumn("sys_user", "source")) {
      return;
    }
    await queryRunner.query(
      "ALTER TABLE `sys_user` ADD `source` varchar(32) NULL COMMENT '拉新渠道来源（微信首次归因）' AFTER `remark`"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("sys_user"))) {
      return;
    }
    if (!(await queryRunner.hasColumn("sys_user", "source"))) {
      return;
    }
    await queryRunner.query("ALTER TABLE `sys_user` DROP COLUMN `source`");
  }
}
