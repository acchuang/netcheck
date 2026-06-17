# netcheck-site

## Purpose

Network connectivity testing web app. Vite + vanilla TypeScript frontend (no framework) with Cloudflare Worker backend.

## Ownership

Independent Vite + vanilla TypeScript project (no framework) deployed via Cloudflare Pages + Workers.

## Local Contracts

- Vite + vanilla TypeScript frontend (no React, no framework). TypeScript via `tsconfig.json`.
- Cloudflare Worker backend in `src/worker/` for server-side network checks.
- Styling: Tailwind v4 (`src/client/app.css`, imported via `app.ts`) coexists with hand-written CSS in `public/css/` (`styles.css`, `tokens.css`, `utilities.css`, loaded via `index.html`). No single source of truth — both systems are live; match the existing system of the file you're editing.
- ESLint + Prettier configured. Vitest for unit tests, Playwright for e2e.
- Deployed via `wrangler`.

## Work Guidance

- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npx eslint .`
- Format: `npx prettier --check .`
- Unit test: `npx vitest run`
- E2E test: `npx playwright test`
- Type-check: `npx tsc --noEmit`

## Child DOX Index

| Path | Purpose |
|---|---|
| `src/worker/` | Cloudflare Worker backend for network checks |
