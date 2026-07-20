import type { MigrationInterface, QueryRunner, Table } from "typeorm";

/**
 * 薪资表收口 + 全库审查索引补齐（一条）：
 * - salary_verify_history：去库级 FK、varchar→ENUM、删 saved_at、列表索引
 * - sys_*：逻辑外键 / 关联表反向列索引
 */
export class SalarySchemaAndIndexes1763000000000 implements MigrationInterface {
  name = "SalarySchemaAndIndexes1763000000000";

  private hasIndex(table: Table | undefined, indexName: string): boolean {
    return Boolean(table?.indices.some(index => index.name === indexName));
  }

  private async ensureIndex(queryRunner: QueryRunner, tableName: string, indexName: string, columnsSql: string): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!this.hasIndex(table, indexName)) {
      await queryRunner.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columnsSql})`);
    }
  }

  private async dropIndexIfExists(queryRunner: QueryRunner, tableName: string, indexName: string): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (this.hasIndex(table, indexName)) {
      await queryRunner.query(`DROP INDEX \`${indexName}\` ON \`${tableName}\``);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable("salary_verify_history")) {
      const salaryTable = await queryRunner.getTable("salary_verify_history");
      const foreignKey = salaryTable?.foreignKeys.find(fk => fk.name === "FK_salary_verify_history_sys_user");
      if (foreignKey) {
        await queryRunner.query("ALTER TABLE `salary_verify_history` DROP FOREIGN KEY `FK_salary_verify_history_sys_user`");
      }

      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` MODIFY `history_type` enum('verify','calc') NOT NULL DEFAULT 'verify' COMMENT '历史类型：verify月薪核对/calc年薪测算'"
      );
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` MODIFY `year_end_tax_mode` enum('none','separate','merge') NULL COMMENT '年终奖计税方式：none/separate/merge'"
      );
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` MODIFY `pay_period` varchar(7) NULL COMMENT '工资所属月份 YYYY-MM（verify 类型必填；calc 为 NULL，允许多条）'"
      );

      if (await queryRunner.hasColumn("salary_verify_history", "saved_at")) {
        await queryRunner.query("ALTER TABLE `salary_verify_history` DROP COLUMN `saved_at`");
      }

      await this.ensureIndex(
        queryRunner,
        "salary_verify_history",
        "idx_salary_verify_history_user_list",
        "`user_id`, `del_flag`, `history_type`"
      );
    }

    await this.ensureIndex(queryRunner, "sys_user", "idx_sys_user_dept_id", "`dept_id`");
    await this.ensureIndex(queryRunner, "sys_menu", "idx_sys_menu_parent_id", "`parent_id`");
    await this.ensureIndex(queryRunner, "sys_dept", "idx_sys_dept_parent_id", "`parent_id`");
    await this.ensureIndex(queryRunner, "sys_user_role", "idx_sys_user_role_role_id", "`role_id`");
    await this.ensureIndex(queryRunner, "sys_user_post", "idx_sys_user_post_post_id", "`post_id`");
    await this.ensureIndex(queryRunner, "sys_role_menu", "idx_sys_role_menu_menu_id", "`menu_id`");
    await this.ensureIndex(queryRunner, "sys_role_dept", "idx_sys_role_dept_dept_id", "`dept_id`");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfExists(queryRunner, "sys_role_dept", "idx_sys_role_dept_dept_id");
    await this.dropIndexIfExists(queryRunner, "sys_role_menu", "idx_sys_role_menu_menu_id");
    await this.dropIndexIfExists(queryRunner, "sys_user_post", "idx_sys_user_post_post_id");
    await this.dropIndexIfExists(queryRunner, "sys_user_role", "idx_sys_user_role_role_id");
    await this.dropIndexIfExists(queryRunner, "sys_dept", "idx_sys_dept_parent_id");
    await this.dropIndexIfExists(queryRunner, "sys_menu", "idx_sys_menu_parent_id");
    await this.dropIndexIfExists(queryRunner, "sys_user", "idx_sys_user_dept_id");
    await this.dropIndexIfExists(queryRunner, "salary_verify_history", "idx_salary_verify_history_user_list");

    if (await queryRunner.hasTable("salary_verify_history")) {
      if (!(await queryRunner.hasColumn("salary_verify_history", "saved_at"))) {
        await queryRunner.query(
          "ALTER TABLE `salary_verify_history` ADD COLUMN `saved_at` bigint NOT NULL DEFAULT '0' COMMENT '前端保存时间戳（毫秒）'"
        );
      }

      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` MODIFY `history_type` varchar(20) NOT NULL DEFAULT 'verify' COMMENT '历史类型：verify月薪核对/calc年薪测算'"
      );
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` MODIFY `year_end_tax_mode` varchar(20) NULL COMMENT '年终奖计税方式：none/separate/merge'"
      );
      await queryRunner.query(
        "ALTER TABLE `salary_verify_history` MODIFY `pay_period` varchar(7) NULL COMMENT '工资所属月份 YYYY-MM（verify 类型必填）'"
      );

      const salaryTable = await queryRunner.getTable("salary_verify_history");
      const hasForeignKey = salaryTable?.foreignKeys.some(fk => fk.name === "FK_salary_verify_history_sys_user");
      if (!hasForeignKey) {
        await queryRunner.query(
          "ALTER TABLE `salary_verify_history` ADD CONSTRAINT `FK_salary_verify_history_sys_user` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION"
        );
      }
    }
  }
}
