# AGENTS.md

Roco PVP WebUI — 洛克王国比赛推流控制台. Electron (Express + Socket.IO) backend + React/AntD admin UI. Code comments, commit messages, and the docs in `.agents/` are in Chinese.

## Commands (all via `package.json` scripts)

- `npm run build` — renderer + electron. Triggers `prebuild` → `npm run sync:sprites`, which **downloads sprite images from the network** (`热补丁索引/spirits_index.json`). To regenerate the index without downloads: `node scripts/sync-spirits-assets.mjs --skip-download`.
- `npm run dev` — build renderer + electron, then launch Electron desktop app.
- `npm run serve:node` — build + headless Node server (default `--host 127.0.0.1 --port 9988`). Same mode Docker uses.
- `npm run package` — build + electron-builder → Windows NSIS installer into `release/` (gitignored).
- **No lint, no formatter, no test suite.** Verification = `npm run build` + `npm run typecheck:frontend`.

## Two separate TS projects — mind the differences

- Electron: `tsconfig.json` (`NodeNext` ESM, emits to `dist-electron/`). Relative imports **must use `.js` extensions** (`../shared/events.js`). It has no `noEmit`, so typechecking the electron side is just `npm run build:electron`.
- Frontend React: `tsconfig.frontend.json` (`Bundler`, `noEmit`); checked with `npm run typecheck:frontend`. Covers only `src/admin-antd`, `src/login-antd`, `shared`.
- Vite (`vite.config.ts`) bundles **only** `src/pages/admin-antd.html` and `src/pages/login.html` into `dist/`; `emptyOutDir: true` wipes `dist/` each build.
- The streaming/display pages (`src/pages/*.html`, `src/scripts/*.js`, `src/styles/*.css`) are plain vanilla JS served statically — they are NOT part of the Vite build.

## Two run modes — auth behavior differs

- Desktop (`electron/main.ts`): auth **disabled**, admin UI at `/admin.html`.
- Node server (`electron/server-entry.ts`, also Dockerfile): auth **enabled**; defaults `admin`/`admin123` unless `ADMIN_USER`/`ADMIN_PASS` env vars are set. Docker compose sets them explicitly.

## Runtime data (generated, gitignored — never commit)

- Panel/scoreboard/match/page4/stage/avatar state and port config live as JSON/PNG in `runtime/cache/` under a userData dir, resolved in `electron/services/path-service.ts`:
  - Desktop: Electron `app.getPath('userData')`.
  - Node/Docker: `<projectRoot>/LuokePVPWebui` (override with `ROCO_DATA_DIR`).
- `resources/data/sprites.json` and `resources/sprites-img/` are **generated** by `scripts/sync-spirits-assets.mjs` from `热补丁索引/spirits_index.json` (live sprite dir served at `/img/`). Re-run the script (or edit `spirits_index.json` and regenerate) when sprites change; don't hand-edit `sprites.json`.

## Architecture

- One Express + Socket.IO server in `electron/socket-server.ts` owns all REST routes and socket emits. `electron/services/*` are pure file-backed stores; add all new paths in `path-service.ts`.
- `shared/types.ts` (all types), `shared/events.ts` (socket events), `shared/constants.ts` (defaults: port 9988, BO7, 6 slots) — imported by both electron and React code.
- Admin UI: `src/admin-antd/App.tsx` (roster / live / history / scoreboard / preview / about). Login: `src/login-antd/App.tsx`.
- Detailed indexes (types, API routes, functions, socket events, constants, file map) are in `.agents/01..10-*.md` — refer to them and keep them updated when behavior drifts.

## Gotchas

- `.npmrc` pins npmmirror registry + Electron binary mirrors; installs can fail offline. `sync:sprites` needs network unless `--skip-download`.
- Avatar upload validates file magic bytes (stored-XSS mitigation in `image-service.ts`) — preserve that check.
- `antd` skill is available (`.claude/skills/antd`) for Ant Design work.
- Commit style: conventional commits with Chinese scope/body, e.g. `feat(stage): ...`, `fix(security): ...`.
