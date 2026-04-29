# ll-admin

## Monorepo

This repository uses `pnpm workspace` + `turbo` for task orchestration.

### Common commands

- `pnpm build`: build all packages/apps with dependency order and cache.
- `pnpm lint`: run lint tasks across the monorepo.
- `pnpm typecheck`: run type checking across the monorepo.
- `pnpm test`: run test tasks across the monorepo.
- `pnpm check`: run lint + typecheck + test in sequence.

### App-level development

- `pnpm dev:server`
- `pnpm dev:admin`
- `pnpm dev:docs`
- `pnpm dev:uniapp:h5`
- `pnpm dev:uniapp:mp`