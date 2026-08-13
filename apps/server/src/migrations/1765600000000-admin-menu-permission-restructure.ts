import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Admin 动态路由 / 菜单权限收口（已有库升级）
 *
 * 1. 去掉 sys_menu.visible、active_menu（个人中心等改前端 staticRoutes）
 * 2. 删除「个人中心」及监控/外部文档菜单树（改走 local.ts）
 * 3. 「登录日志」挂到系统管理末级
 * 4. 按前端 authCode 种子化各二级页 F 按钮权限
 * 5. data_scope：去掉「自定」后重映射为 1全部 / 2本部门 / 3本部门及以下 / 4仅本人
 *
 * @note 按 path / menu_name 删除，避免误删重编号后的角色管理(101) 等业务菜单
 */
export class AdminMenuPermissionRestructure1765600000000 implements MigrationInterface {
  name = "AdminMenuPermissionRestructure1765600000000";

  /** 监控 / 外链目录及子页（迁 local.ts） */
  private readonly localMenuPaths = [
    "/monitor",
    "/monitor/server",
    "/monitor/cache",
    "/monitor/logininfor",
    "/iframe",
    "https://element-plus.org/zh-CN/",
    "https://antdv.com/components/overview-cn/"
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("sys_menu"))) {
      return;
    }

    // —— 1. 结构：去掉侧栏可见性 / 高亮菜单列 ——
    if (await queryRunner.hasColumn("sys_menu", "visible")) {
      await queryRunner.query("ALTER TABLE `sys_menu` DROP COLUMN `visible`");
    }
    if (await queryRunner.hasColumn("sys_menu", "active_menu")) {
      await queryRunner.query("ALTER TABLE `sys_menu` DROP COLUMN `active_menu`");
    }

    // —— 2. 删个人中心（按名称/路径，不按易冲突的 menu_id） ——
    await queryRunner.query(`
      DELETE rm FROM sys_role_menu rm
      INNER JOIN sys_menu m ON m.menu_id = rm.menu_id
      WHERE m.menu_name = '个人中心'
         OR m.path IN ('/user/profile', 'profile', '/system/user/profile')
         OR m.name = 'Profile'
    `);
    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE menu_name = '个人中心'
         OR path IN ('/user/profile', 'profile', '/system/user/profile')
         OR name = 'Profile'
    `);

    // —— 3. 删系统监控 / 外部文档（含旧登录日志路径） ——
    await queryRunner.query(`
      DELETE rm FROM sys_role_menu rm
      INNER JOIN sys_menu m ON m.menu_id = rm.menu_id
      WHERE m.path IN (${this.localMenuPaths.map(p => `'${p}'`).join(",")})
         OR m.menu_name IN ('系统监控', '外部文档', 'Element Plus', 'Pure Admin')
         OR m.parent_id IN (
           SELECT mid FROM (
             SELECT menu_id AS mid FROM sys_menu
             WHERE path IN ('/monitor', '/iframe') OR menu_name IN ('系统监控', '外部文档')
           ) t
         )
    `);
    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE path IN (${this.localMenuPaths.map(p => `'${p}'`).join(",")})
         OR menu_name IN ('系统监控', '外部文档', 'Element Plus', 'Pure Admin')
         OR parent_id IN (
           SELECT mid FROM (
             SELECT menu_id AS mid FROM sys_menu
             WHERE path IN ('/monitor', '/iframe') OR menu_name IN ('系统监控', '外部文档')
           ) t
         )
    `);
    // 再清一次孤儿子节点（父已删）
    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE parent_id <> 0
        AND parent_id NOT IN (SELECT mid FROM (SELECT menu_id AS mid FROM sys_menu) t)
    `);

    // —— 4. 登录日志：系统管理下最后一个二级 M ——
    const systemRows: Array<{ menu_id: number }> = await queryRunner.query(
      `SELECT menu_id FROM sys_menu WHERE path = '/system' AND menu_type = 'M' LIMIT 1`
    );
    const systemId = systemRows[0]?.menu_id ?? 1;

    await queryRunner.query(`
      DELETE rm FROM sys_role_menu rm
      INNER JOIN sys_menu m ON m.menu_id = rm.menu_id
      WHERE m.path IN ('/system/logininfor', '/monitor/logininfor')
         OR (m.menu_name = '登录日志' AND m.menu_type = 'M')
    `);
    await queryRunner.query(`
      DELETE FROM sys_menu
      WHERE path IN ('/system/logininfor', '/monitor/logininfor')
         OR (menu_name = '登录日志' AND menu_type = 'M')
    `);

    await queryRunner.query(
      `
      INSERT INTO sys_menu (
        status, del_flag, create_by, create_time, update_by, update_time,
        menu_id, menu_name, parent_id, ancestors, order_num, path, component, name,
        is_frame, is_cache, icon, perm, menu_type
      ) VALUES (
        '0', '0', 1, NOW(6), 1, NOW(6),
        107, '登录日志', ?, CONCAT('0,', ?), 8,
        '/system/logininfor', 'monitor/logininfor/index', 'Logininfor',
        '1', '0', 'ant-design:customer-service-outlined', '', 'M'
      )
      ON DUPLICATE KEY UPDATE
        menu_name = VALUES(menu_name),
        parent_id = VALUES(parent_id),
        ancestors = VALUES(ancestors),
        order_num = VALUES(order_num),
        path = VALUES(path),
        component = VALUES(component),
        name = VALUES(name),
        icon = VALUES(icon),
        menu_type = 'M'
      `,
      [systemId, systemId]
    );

    // —— 5. 二级页 F 按钮权限（与前端 authCode 对齐；幂等覆盖） ——
    const fRows: Array<{
      menuId: number;
      menuName: string;
      parentPath: string;
      orderNum: number;
      perm: string;
    }> = [
      { menuId: 1001, menuName: "用户新增", parentPath: "/system/user", orderNum: 1, perm: "add" },
      { menuId: 1002, menuName: "用户修改", parentPath: "/system/user", orderNum: 2, perm: "edit" },
      { menuId: 1003, menuName: "用户删除", parentPath: "/system/user", orderNum: 3, perm: "remove" },
      { menuId: 1004, menuName: "用户导出", parentPath: "/system/user", orderNum: 4, perm: "export" },
      { menuId: 1005, menuName: "用户导入", parentPath: "/system/user", orderNum: 5, perm: "import" },
      { menuId: 1006, menuName: "重置密码", parentPath: "/system/user", orderNum: 6, perm: "resetPwd" },
      { menuId: 1011, menuName: "角色新增", parentPath: "/system/role", orderNum: 1, perm: "add" },
      { menuId: 1012, menuName: "角色修改", parentPath: "/system/role", orderNum: 2, perm: "edit" },
      { menuId: 1013, menuName: "角色删除", parentPath: "/system/role", orderNum: 3, perm: "remove" },
      { menuId: 1014, menuName: "角色导出", parentPath: "/system/role", orderNum: 4, perm: "export" },
      { menuId: 1021, menuName: "菜单新增", parentPath: "/system/menu", orderNum: 1, perm: "add" },
      { menuId: 1022, menuName: "菜单修改", parentPath: "/system/menu", orderNum: 2, perm: "edit" },
      { menuId: 1023, menuName: "菜单删除", parentPath: "/system/menu", orderNum: 3, perm: "remove" },
      { menuId: 1031, menuName: "部门新增", parentPath: "/system/dept", orderNum: 1, perm: "add" },
      { menuId: 1032, menuName: "部门修改", parentPath: "/system/dept", orderNum: 2, perm: "edit" },
      { menuId: 1033, menuName: "部门删除", parentPath: "/system/dept", orderNum: 3, perm: "remove" },
      { menuId: 1041, menuName: "岗位新增", parentPath: "/system/post", orderNum: 1, perm: "add" },
      { menuId: 1042, menuName: "岗位修改", parentPath: "/system/post", orderNum: 2, perm: "edit" },
      { menuId: 1043, menuName: "岗位删除", parentPath: "/system/post", orderNum: 3, perm: "remove" },
      { menuId: 1044, menuName: "岗位导出", parentPath: "/system/post", orderNum: 4, perm: "export" },
      { menuId: 1051, menuName: "参数新增", parentPath: "/system/config", orderNum: 1, perm: "add" },
      { menuId: 1052, menuName: "参数修改", parentPath: "/system/config", orderNum: 2, perm: "edit" },
      { menuId: 1053, menuName: "参数删除", parentPath: "/system/config", orderNum: 3, perm: "remove" },
      { menuId: 1054, menuName: "参数导出", parentPath: "/system/config", orderNum: 4, perm: "export" },
      { menuId: 1061, menuName: "公告新增", parentPath: "/system/notice", orderNum: 1, perm: "add" },
      { menuId: 1062, menuName: "公告修改", parentPath: "/system/notice", orderNum: 2, perm: "edit" },
      { menuId: 1063, menuName: "公告删除", parentPath: "/system/notice", orderNum: 3, perm: "remove" },
      { menuId: 1071, menuName: "登录日志导出", parentPath: "/system/logininfor", orderNum: 1, perm: "export" }
    ];

    const parentIdByPath = new Map<string, number>();
    for (const path of [...new Set(fRows.map(r => r.parentPath))]) {
      const rows: Array<{ menu_id: number }> = await queryRunner.query(
        `SELECT menu_id FROM sys_menu WHERE path = ? AND menu_type = 'M' LIMIT 1`,
        [path]
      );
      if (rows[0]?.menu_id != null) {
        parentIdByPath.set(path, rows[0].menu_id);
      }
    }

    // 清掉目标 parent 下旧 F（避免重复 perm）
    const parentIds = [...parentIdByPath.values()];
    if (parentIds.length) {
      await queryRunner.query(
        `DELETE FROM sys_role_menu WHERE menu_id IN (
           SELECT menu_id FROM sys_menu WHERE menu_type = 'F' AND parent_id IN (${parentIds.join(",")})
         )`
      );
      await queryRunner.query(
        `DELETE FROM sys_menu WHERE menu_type = 'F' AND parent_id IN (${parentIds.join(",")})`
      );
    }
    // 同时清固定 menu_id 区间，防止残留
    await queryRunner.query(`
      DELETE FROM sys_role_menu WHERE menu_id BETWEEN 1001 AND 1071
    `);
    await queryRunner.query(`
      DELETE FROM sys_menu WHERE menu_id BETWEEN 1001 AND 1071
    `);

    for (const row of fRows) {
      const parentId = parentIdByPath.get(row.parentPath);
      if (parentId == null) continue;
      await queryRunner.query(
        `
        INSERT INTO sys_menu (
          status, del_flag, create_by, create_time, update_by, update_time,
          menu_id, menu_name, parent_id, ancestors, order_num, path, component, name,
          is_frame, is_cache, icon, perm, menu_type
        ) VALUES (
          '0', '0', 1, NOW(6), 1, NOW(6),
          ?, ?, ?, CONCAT('0,', ?, ',', ?), ?,
          '', '', '', '1', '0', '', ?, 'F'
        )
        `,
        [row.menuId, row.menuName, parentId, systemId, parentId, row.orderNum, row.perm]
      );
    }

    // —— 6. data_scope 重映射（旧 1全部 2自定 3本部门 4本部门及以下 5仅本人） ——
    // 仅当列定义仍含 '5' 时执行，避免已收口库二次映射把 2/3/4 再错移
    if (await queryRunner.hasTable("sys_role")) {
      const scopeCols: Array<{ Type?: string; type?: string }> = await queryRunner.query(
        "SHOW COLUMNS FROM `sys_role` LIKE 'data_scope'"
      );
      const scopeType = String(scopeCols[0]?.Type ?? scopeCols[0]?.type ?? "");
      if (scopeType.includes("'5'")) {
        await queryRunner.query(`
          UPDATE sys_role SET data_scope = CASE data_scope
            WHEN '5' THEN '4'
            WHEN '4' THEN '3'
            WHEN '3' THEN '2'
            WHEN '2' THEN '1'
            ELSE data_scope
          END
        `);
        await queryRunner.query(`
          ALTER TABLE \`sys_role\`
          MODIFY COLUMN \`data_scope\` enum('1','2','3','4')
          NOT NULL DEFAULT '1'
          COMMENT '数据范围（1全部 2本部门 3本部门及以下 4仅本人）'
        `);
        if (await queryRunner.hasTable("sys_role_dept")) {
          await queryRunner.query(`DELETE FROM sys_role_dept`);
        }
      } else {
        // 枚举已是 1-4，仅同步注释
        await queryRunner.query(`
          ALTER TABLE \`sys_role\`
          MODIFY COLUMN \`data_scope\` enum('1','2','3','4')
          NOT NULL DEFAULT '1'
          COMMENT '数据范围（1全部 2本部门 3本部门及以下 4仅本人）'
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("sys_menu"))) {
      return;
    }

    await queryRunner.query(`DELETE FROM sys_role_menu WHERE menu_id BETWEEN 1001 AND 1071 OR menu_id = 107`);
    await queryRunner.query(`DELETE FROM sys_menu WHERE menu_id BETWEEN 1001 AND 1071 OR menu_id = 107`);

    if (!(await queryRunner.hasColumn("sys_menu", "active_menu"))) {
      await queryRunner.query(
        `ALTER TABLE \`sys_menu\` ADD \`active_menu\` varchar(255) NOT NULL DEFAULT '' COMMENT '高亮菜单'`
      );
    }
    if (!(await queryRunner.hasColumn("sys_menu", "visible"))) {
      await queryRunner.query(
        `ALTER TABLE \`sys_menu\` ADD \`visible\` enum('0','1') NOT NULL DEFAULT '0' COMMENT '是否显示'`
      );
    }

    if (await queryRunner.hasTable("sys_role")) {
      await queryRunner.query(`
        ALTER TABLE \`sys_role\`
        MODIFY COLUMN \`data_scope\` enum('1','2','3','4','5')
        NOT NULL DEFAULT '1'
        COMMENT '数据范围（1全部 2自定 3本部门 4本部门及以下 5仅本人）'
      `);
      // 无法无损还原旧值，仅恢复枚举容量
    }
  }
}
