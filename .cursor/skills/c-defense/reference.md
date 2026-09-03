# 防御性编程分语言参考（摘录）

决策逻辑见 [SKILL.md](SKILL.md)。以下为本仓常用语言要点。

## TypeScript / JavaScript

TS 仅编译期有效。可信域信任类型；不可信边界（`JSON.parse`、网络、`invoke`、storage）用 Zod/Valibot 或显式校验。

```ts
// ❌ 可信域过度防御 + 静默 0
function calcPrice(good: { price: number }) {
  if (!good) return 0;
  if (typeof good.price !== "number") return 0;
  return good.price * 1.2;
}

// ✅ 可信域交给 TS
function calcPrice(good: { price: number }) {
  return good.price * 1.2;
}

// ❌ 边界 as 强转
const data = (await resp.json()) as Goods;

// ✅ 边界校验失败显式报错
const res = GoodsSchema.safeParse(raw);
if (!res.success) throw new Error("非法数据");
```

## NestJS / class-validator

DTO + ValidationPipe 是 HTTP 边界；Service 内部信任已校验 DTO，勿重复手写类型 if。

## Rust（Tauri）

外部路径/用户选择目录/IPC 参数为不可信；用 `Result` 传播，禁止 `unwrap` 吞掉用户可触发错误（测试除外）。改完遵守 `rust-tauri.mdc`：`cargo check` 0 warning。

## 推荐库

| 语言 | 边界校验 |
|------|----------|
| TS | Zod / Valibot（前端按需）；Nest 用 class-validator |
| Rust | 类型 + `Result`；serde 失败当错误 |
| Python | Pydantic v2（若脚本场景） |
