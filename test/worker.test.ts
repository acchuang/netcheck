// Smoke test — runs with `npm test` (node --test, native type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSpeedDown } from "../src/worker/index.ts";

test("speed download endpoint caps bytes and handles missing param", async () => {
  const capped = handleSpeedDown(new URL("https://x/api/speedtest/down?bytes=999999999"));
  assert.equal(capped.headers.get("Content-Length"), "100000000");

  const empty = handleSpeedDown(new URL("https://x/api/speedtest/down"));
  assert.equal(await empty.text(), "");
});
