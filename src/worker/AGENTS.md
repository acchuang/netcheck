# netcheck-site/src/worker

## Purpose

Cloudflare Worker backend for running network connectivity checks (ping, DNS, traceroute, etc.).

## Ownership

Child of `netcheck-site/`. Edge runtime.

## Local Contracts

- Cloudflare Workers runtime. TypeScript.
- Receives test requests from the browser frontend, executes network diagnostics, returns results.

## Work Guidance

- Dev: `npx wrangler dev` (from netcheck-site root or worker directory — check wrangler config).
- Deploy: part of the main `wrangler deploy`.
