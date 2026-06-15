# netcheck-site

## Purpose

Network connectivity testing web app. Vite + React frontend with Cloudflare Worker backend.

## Ownership

Independent Vite + React project deployed via Cloudflare Pages + Workers.

## Local Contracts

- Vite + React frontend. TypeScript via `tsconfig.json`.
- Cloudflare Worker backend in `src/worker/` for server-side network checks.
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
