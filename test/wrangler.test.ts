// A tripwire, not a schema check. Every binding in wrangler.toml hands the
// Worker a capability it did not have before — a KV namespace it can read, a
// queue it can publish to, an account-scoped service it can call — and the
// Worker code is public-facing with no auth on any route. Adding one should be
// a deliberate act, so this test fails on any binding that hasn't been
// reviewed and listed here.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

/** Uncommented `[table]` / `[[array]]` headers, in file order. */
function sections(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#"))
    .map((line) => /^\[\[?([^\]]+)\]\]?$/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name));
}

// Reviewed and intentional. Anything else is a new capability.
const ALLOWED_SECTIONS = new Set([
  "unsafe.bindings", // API_RATE_LIMITER — counts requests, holds no data
  "vars",            // plain config, no credentials (PROBE_SECRET is a wrangler secret)
]);

test("wrangler.toml declares no binding that hasn't been reviewed", () => {
  const unexpected = sections(toml).filter((name) => !ALLOWED_SECTIONS.has(name));
  assert.deepEqual(
    unexpected,
    [],
    `Unreviewed wrangler.toml section(s): ${unexpected.join(", ")}. ` +
    "Adding a binding widens what an unauthenticated request can reach — review it, then add it to ALLOWED_SECTIONS."
  );
});

test("the rate limiting binding matches the in-worker fallback budget", () => {
  // src/worker/index.ts keeps a per-isolate counter for when the binding is
  // absent (wrangler dev, these tests). Two numbers, one policy: if they drift,
  // local runs stop resembling production and the drift is invisible.
  const binding = /name\s*=\s*"API_RATE_LIMITER"[\s\S]*?simple\s*=\s*\{([^}]*)\}/.exec(toml);
  assert.ok(binding, "API_RATE_LIMITER binding missing from wrangler.toml");
  assert.match(binding[1], /limit\s*=\s*20\b/);
  assert.match(binding[1], /period\s*=\s*60\b/);

  const worker = readFileSync(new URL("../src/worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /RATE_WINDOW_MS = 60_000/);
  assert.match(worker, /"headers-check": 20, dns: 20/);
});
