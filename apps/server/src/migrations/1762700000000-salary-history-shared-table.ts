import type { MigrationInterface, QueryRunner } from "typeorm";

export class SalaryHistorySharedTable1762700000000 implements MigrationInterface {
  name = "SalaryHistorySharedTable1762700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("salary_verify_history", "history_type"))) {
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` ADD COLUMN `history_type` varchar(20) NOT NULL DEFAULT 'verify' COMMENT '历史类型：verify月薪核对/calc年薪测算'"
      );
    }

    if (!(await queryRunner.hasColumn("salary_verify_history", "year_end_tax_mode"))) {
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` ADD COLUMN `year_end_tax_mode` varchar(20) NULL COMMENT '年终奖计税方式：none/separate/merge'"
      );
    }

    if (!(await queryRunner.hasColumn("salary_verify_history", "year_end_bonus"))) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` ADD COLUMN `year_end_bonus` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '年终奖'");
    }

    await queryRunner.query("UPDATE `salary_verify_history` SET `history_type` = 'verify' WHERE `history_type` IS NULL OR `history_type` = ''");

    await queryRunner.query("ALTER TABLE `salary_verify_history` MODIFY `pay_period` varchar(7) NULL COMMENT '工资所属月份 YYYY-MM（verify 类型必填）'");

    const salaryHistoryTable = await queryRunner.getTable("salary_verify_history");
    const oldIndex = salaryHistoryTable?.indices.find(index => index.name === "idx_salary_verify_history_user_period");
    const oldForeignKey = salaryHistoryTable?.foreignKeys.find(fk => fk.name === "FK_salary_verify_history_sys_user");
    if (oldForeignKey) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP FOREIGN KEY `FK_salary_verify_history_sys_user`");
    }
    if (oldIndex) {
      await queryRunner.query("DROP INDEX `idx_salary_verify_history_user_period` ON `salary_verify_history`");
    }
    await queryRunner.query("CREATE UNIQUE INDEX `idx_salary_verify_history_user_period` ON `salary_verify_history` (`user_id`, `history_type`, `pay_period`)");
    const salaryHistoryTableAfterIndex = await queryRunner.getTable("salary_verify_history");
    const hasForeignKey = salaryHistoryTableAfterIndex?.foreignKeys.some(fk => fk.name === "FK_salary_verify_history_sys_user");
    if (!hasForeignKey) {
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` ADD CONSTRAINT `FK_salary_verify_history_sys_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION"
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const salaryHistoryTable = await queryRunner.getTable("salary_verify_history");
    const currentIndex = salaryHistoryTable?.indices.find(index => index.name === "idx_salary_verify_history_user_period");
    const currentForeignKey = salaryHistoryTable?.foreignKeys.find(fk => fk.name === "FK_salary_verify_history_sys_user");
    if (currentForeignKey) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP FOREIGN KEY `FK_salary_verify_history_sys_user`");
    }
    if (currentIndex) {
      await queryRunner.query("DROP INDEX `idx_salary_verify_history_user_period` ON `salary_verify_history`");
    }
    await queryRunner.query("CREATE UNIQUE INDEX `idx_salary_verify_history_user_period` ON `salary_verify_history` (`user_id`, `pay_period`)");
    const salaryHistoryTableAfterRollback = await queryRunner.getTable("salary_verify_history");
    const hasForeignKey = salaryHistoryTableAfterRollback?.foreignKeys.some(fk => fk.name === "FK_salary_verify_history_sys_user");
    if (!hasForeignKey) {
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` ADD CONSTRAINT `FK_salary_verify_history_sys_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION"
      );
    }

    // 回滚到旧结构时，删除仅用于 calc 的记录，避免旧唯一键与非空约束冲突
    await queryRunner.query("DELETE FROM `salary_verify_history` WHERE `history_type` = 'calc'");
    await queryRunner.query("ALTER TABLE `salary_verify_history` MODIFY `pay_period` varchar(7) NOT NULL COMMENT '工资所属月份 YYYY-MM'");

    if (await queryRunner.hasColumn("salary_verify_history", "year_end_bonus")) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP COLUMN `year_end_bonus`");
    }
    if (await queryRunner.hasColumn("salary_verify_history", "year_end_tax_mode")) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP COLUMN `year_end_tax_mode`");
    }
    if (await queryRunner.hasColumn("salary_verify_history", "history_type")) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP COLUMN `history_type`");
    }
  }
}
