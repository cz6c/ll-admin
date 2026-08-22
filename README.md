# ll-admin

## Monorepo

This repository uses `pnpm workspace` + `turbo` for task orchestration.

### First-time setup

Use the setup command for the app you are working on. It installs that app and
its workspace dependencies instead of eagerly linking every application in the
repository (especially the much larger `apps/uni` dependency graph).

`setup:admin` and `setup:server` also build `@llcz/common`, whose published
entry points are generated under `packages/common/dist` and are not committed.

- `pnpm setup:admin`
- `pnpm setup:server`
- `pnpm setup:docs`
- `pnpm setup:uni`

Use `pnpm install --frozen-lockfile` only when you need the complete workspace,
such as for an all-app CI build. Keep the pnpm store cached in CI and run
`pnpm fetch --frozen-lockfile` in the cache-population step so dependency
downloads are independent of the build step.

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
