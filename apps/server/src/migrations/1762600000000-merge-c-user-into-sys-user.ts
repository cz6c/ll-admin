import type { MigrationInterface, QueryRunner } from "typeorm";

export class MergeCUserIntoSysUser1762600000000 implements MigrationInterface {
  name = "MergeCUserIntoSysUser1762600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("sys_user", "login_type"))) {
      await queryRunner.query(`ALTER TABLE \`sys_user\` ADD COLUMN \`login_type\` varchar(20) NOT NULL DEFAULT 'admin' COMMENT '登录类型：admin/weixin'`);
    }
    if (!(await queryRunner.hasColumn("sys_user", "openid"))) {
      await queryRunner.query(`ALTER TABLE \`sys_user\` ADD COLUMN \`openid\` varchar(128) NULL COMMENT '微信 openid'`);
    }
    if (!(await queryRunner.hasColumn("sys_user", "recognize_count"))) {
      await queryRunner.query(`ALTER TABLE \`sys_user\` ADD COLUMN \`recognize_count\` int NOT NULL DEFAULT '0' COMMENT '识别成功次数'`);
    }

    const sysUserTable = await queryRunner.getTable("sys_user");
    const hasOpenidUnique = sysUserTable?.indices.some(index => index.name === "UQ_sys_user_openid");
    if (!hasOpenidUnique) {
      await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_sys_user_openid\` ON \`sys_user\` (\`openid\`)`);
    }

    const hasCUserTable = await queryRunner.hasTable("c_user");
    if (!hasCUserTable) {
      return;
    }

    // 1) 优先将既有 wx_{openid} 用户绑定到 openid，并标注为 weixin 登录类型
    await queryRunner.query(
      `UPDATE \`sys_user\` su
      JOIN \`c_user\` cu ON BINARY su.\`user_name\` = BINARY CONCAT('wx_', cu.\`openid\`)
      SET su.\`openid\` = cu.\`openid\`,
          su.\`login_type\` = 'weixin',
          su.\`recognize_count\` = cu.\`recognize_count\``
    );

    // 2) 若不存在对应用户，则补建 weixin 用户
    await queryRunner.query(
      `INSERT INTO \`sys_user\`
      (\`dept_id\`, \`user_name\`, \`nick_name\`, \`user_type\`, \`login_type\`, \`openid\`, \`recognize_count\`,
       \`email\`, \`phonenumber\`, \`sex\`, \`avatar\`, \`password\`, \`login_ip\`, \`login_date\`, \`remark\`,
       \`status\`, \`del_flag\`, \`create_by\`, \`update_by\`)
      SELECT NULL,
             CONCAT('wx_', cu.\`openid\`),
             CONCAT('wx_', cu.\`openid\`),
             '10',
             'weixin',
             cu.\`openid\`,
             cu.\`recognize_count\`,
             '',
             '',
             '2',
             '',
             MD5(CONCAT('wx_', cu.\`openid\`, '_init_pwd')),
             '',
             NOW(),
             '微信小程序用户',
             cu.\`status\`,
             cu.\`del_flag\`,
             cu.\`create_by\`,
             cu.\`update_by\`
      FROM \`c_user\` cu
      LEFT JOIN \`sys_user\` su ON BINARY su.\`openid\` = BINARY cu.\`openid\`
      WHERE su.\`user_id\` IS NULL`
    );

    if (!(await queryRunner.hasColumn("salary_verify_history", "user_id"))) {
      await queryRunner.query(`ALTER TABLE \`salary_verify_history\` ADD COLUMN \`user_id\` int NULL COMMENT '用户ID'`);
    }
    await queryRunner.query(
      `UPDATE \`salary_verify_history\` svh
      JOIN \`c_user\` cu ON cu.\`id\` = svh.\`c_user_id\`
      JOIN \`sys_user\` su ON BINARY su.\`openid\` = BINARY cu.\`openid\`
      SET svh.\`user_id\` = su.\`user_id\``
    );

    const salaryHistoryTable = await queryRunner.getTable("salary_verify_history");
    const oldForeignKey = salaryHistoryTable?.foreignKeys.find(fk => fk.name === "FK_salary_verify_history_c_user");
    if (oldForeignKey) {
      await queryRunner.query(`ALTER TABLE \`salary_verify_history\` DROP FOREIGN KEY \`FK_salary_verify_history_c_user\``);
    }
    const oldIndex = salaryHistoryTable?.indices.find(index => index.name === "idx_salary_verify_history_user_period");
    if (oldIndex) {
      await queryRunner.query(`DROP INDEX \`idx_salary_verify_history_user_period\` ON \`salary_verify_history\``);
    }
    if (await queryRunner.hasColumn("salary_verify_history", "c_user_id")) {
      await queryRunner.query(`ALTER TABLE \`salary_verify_history\` DROP COLUMN \`c_user_id\``);
    }
    await queryRunner.query(`ALTER TABLE \`salary_verify_history\` MODIFY \`user_id\` int NOT NULL COMMENT '用户ID'`);
    await queryRunner.query(`CREATE UNIQUE INDEX \`idx_salary_verify_history_user_period\` ON \`salary_verify_history\` (\`user_id\`, \`pay_period\`)`);

    const salaryHistoryTableNew = await queryRunner.getTable("salary_verify_history");
    const hasNewForeignKey = salaryHistoryTableNew?.foreignKeys.some(fk => fk.name === "FK_salary_verify_history_sys_user");
    if (!hasNewForeignKey) {
      await queryRunner.query(
        `ALTER TABLE \`salary_verify_history\`
        ADD CONSTRAINT \`FK_salary_verify_history_sys_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`sys_user\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
      );
    }

    await queryRunner.query(`DROP TABLE \`c_user\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
      `INSERT INTO \`c_user\` (\`openid\`, \`recognize_count\`, \`status\`, \`del_flag\`, \`create_by\`, \`update_by\`)
      SELECT \`openid\`, \`recognize_count\`, \`status\`, \`del_flag\`, \`create_by\`, \`update_by\`
      FROM \`sys_user\`
      WHERE \`openid\` IS NOT NULL`
    );

    await queryRunner.query(`ALTER TABLE \`salary_verify_history\` DROP FOREIGN KEY \`FK_salary_verify_history_sys_user\``);
    await queryRunner.query(`DROP INDEX \`idx_salary_verify_history_user_period\` ON \`salary_verify_history\``);
    await queryRunner.query(`ALTER TABLE \`salary_verify_history\` ADD COLUMN \`c_user_id\` int NULL COMMENT '微信用户ID'`);
    await queryRunner.query(
      `UPDATE \`salary_verify_history\` svh
      JOIN \`sys_user\` su ON su.\`user_id\` = svh.\`user_id\`
      JOIN \`c_user\` cu ON BINARY cu.\`openid\` = BINARY su.\`openid\`
      SET svh.\`c_user_id\` = cu.\`id\``
    );
    await queryRunner.query(`ALTER TABLE \`salary_verify_history\` DROP COLUMN \`user_id\``);
    await queryRunner.query(`ALTER TABLE \`salary_verify_history\` MODIFY \`c_user_id\` int NOT NULL COMMENT '微信用户ID'`);
    await queryRunner.query(`CREATE UNIQUE INDEX \`idx_salary_verify_history_user_period\` ON \`salary_verify_history\` (\`c_user_id\`, \`pay_period\`)`);
    await queryRunner.query(
      `ALTER TABLE \`salary_verify_history\`
      ADD CONSTRAINT \`FK_salary_verify_history_c_user\` FOREIGN KEY (\`c_user_id\`) REFERENCES \`c_user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`
    );

    await queryRunner.query(`DROP INDEX \`UQ_sys_user_openid\` ON \`sys_user\``);
    await queryRunner.query(
      `ALTER TABLE \`sys_user\`
        DROP COLUMN \`recognize_count\`,
        DROP COLUMN \`openid\`,
        DROP COLUMN \`login_type\``
    );
  }
}
