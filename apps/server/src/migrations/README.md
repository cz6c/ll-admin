## Migration 使用流程

本项目使用 TypeORM migration 管理表结构，`synchronize` 需保持为 `false`，通过 migration 变更数据库。

### 1) 新建 migration 文件（手写 SQL）

```bash
$ pnpm run migration:create
```

执行后会在 `src/migrations/` 下生成新文件，按需补充 `up/down`。

### 2) 根据实体变更自动生成 migration（推荐）

```bash
$ pnpm run migration:generate
```

说明：
- 先改好 `src/modules/**/entities/*.entity.ts`
- 再执行 `migration:generate` 生成差异 SQL
- 生成后务必检查一次 SQL 是否符合预期

### 3) 执行 migration（开发环境）

```bash
$ pnpm run migration:run
```

### 4) 回滚最近一次 migration（开发环境）

```bash
$ pnpm run migration:revert
```

### 5) 生产环境执行/回滚

```bash
$ pnpm run migration:run:prod
$ pnpm run migration:revert:prod
```

### 6) 常见建议

- **一个业务需求尽量对应一个 migration**，避免混入无关变更
- **功能开发中只改 Entity；收口后先问用户，得到明确同意再 `migration:generate` / 落盘**；Agent 禁止未经同意主动新建迁移文件
- 新业务表对照 `sys_dept` Entity 样板（见 `.cursor/rules/nestjs-server.mdc`）
- 二级索引按慢查询按需添加，勿盲加
- 不要手改已在生产执行过的 migration，新增下一条 migration 修复
- 提交前建议本地验证一遍：`migration:run -> migration:revert -> migration:run`
- migration 文件命名保持语义化，便于追踪（如 `salary-verify-history`）

### 7) 字符串 JOIN 与排序规则（collation）注意事项

当 SQL 里跨表比较字符串字段（如 `openid`、`user_name`）时，如果两边列的 collation 不一致，可能报错：
`Illegal mix of collations ... for operation '='`。

建议：

- 在 migration 的 `JOIN/WHERE` 字符串比较中，优先使用 `BINARY` 显式比较，避免依赖数据库默认 collation。
- 示例：`ON BINARY su.\`openid\` = BINARY cu.\`openid\``
- 如果必须指定排序规则，可显式 `COLLATE` 到同一 collation 后再比较。

### 8) 失败后可重跑（幂等）写法建议

迁移中途失败后，常见情况是“部分 DDL 已执行”。为避免二次执行时报重复列/索引错误，建议在 migration 中加入存在性判断：

- 加列前先判断：`queryRunner.hasColumn(table, column)`
- 建索引/外键前先通过 `queryRunner.getTable(table)` 判断是否已存在
- 删除列/索引/外键前也先判断再执行
- 涉及数据迁移和删表（如 `DROP TABLE`）时，先确认源表仍存在（`queryRunner.hasTable`）

### 9) 与 `db/init.sql` 同步（部署约定）

- **全新环境**：导入 `db/init.sql` 一次性初始化。
- **已有环境**：只跑 `migration:run` / `migration:run:prod`，禁止用 init 覆盖冲库。
- **新增 migration 后**：必须把「迁移终态」同步进 `init.sql`（最终表结构，不含中间临时表），否则下次空库只导 init 会缺列/缺表。
- 细则见 Cursor 规则 `.cursor/rules/nestjs-server.mdc`「库表部署约定」。
