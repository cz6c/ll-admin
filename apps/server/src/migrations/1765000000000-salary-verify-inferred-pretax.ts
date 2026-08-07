import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * 月薪核对：反推申报应发三字段（用户确认后落库，供后续累计 prior）
 */
export class SalaryVerifyInferredPretax1765000000000 implements MigrationInterface {
  name = "SalaryVerifyInferredPretax1765000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("salary_verify_history"))) {
      return;
    }
    if (!(await queryRunner.hasColumn("salary_verify_history", "inferred_pre_tax"))) {
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` ADD `inferred_pre_tax` decimal(12,2) NULL COMMENT '反推申报应发（用户确认后落库）'"
      );
    }
    if (!(await queryRunner.hasColumn("salary_verify_history", "report_bias"))) {
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` ADD `report_bias` enum('under','over') NULL COMMENT '申报偏差：under少报/over多报'"
      );
    }
    if (!(await queryRunner.hasColumn("salary_verify_history", "use_inferred_for_cumulative"))) {
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` ADD `use_inferred_for_cumulative` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否用反推应发参与后续累计预扣'"
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("salary_verify_history"))) {
      return;
    }
    if (await queryRunner.hasColumn("salary_verify_history", "use_inferred_for_cumulative")) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP COLUMN `use_inferred_for_cumulative`");
    }
    if (await queryRunner.hasColumn("salary_verify_history", "report_bias")) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP COLUMN `report_bias`");
    }
    if (await queryRunner.hasColumn("salary_verify_history", "inferred_pre_tax")) {
      await queryRunner.query("ALTER TABLE `salary_verify_history` DROP COLUMN `inferred_pre_tax`");
    }
  }
}
