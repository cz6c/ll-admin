import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 月薪核对：其他扣款（缺勤等，不进个税累计专项）
 */
export class SalaryVerifyOtherDeduction1765100000000 implements MigrationInterface {
  name = "SalaryVerifyOtherDeduction1765100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("salary_verify_history"))) {
      return;
    }
    if (!(await queryRunner.hasColumn("salary_verify_history", "other_deduction_amount"))) {
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` ADD `other_deduction_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '其他扣款（缺勤等，不含个税抵扣）' AFTER `hf_personal_amount`"
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("salary_verify_history"))) {
      return;
    }
    if (await queryRunner.hasColumn("salary_verify_history", "other_deduction_amount")) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP COLUMN `other_deduction_amount`");
    }
  }
}
