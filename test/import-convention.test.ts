// src/client used extensionless imports while src/shared and src/worker used
// explicit .ts. Vite resolves both, so nothing failed — but `node --test` cannot
// resolve extensionless, which quietly made the whole client layer untestable
// and kept it that way for months. This fails the moment that drifts back.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["src", "probe-server"];
const RELATIVE_IMPORT = /\bfrom\s+"(\.\.?\/[^"]*)"|\bimport\("(\.\.?\/[^"]*)"\)/g;
const HAS_EXTENSION = /\.[a-z0-9]+$/i;

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsFilesUnder(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

test("relative imports carry an explicit extension so node --test can resolve them", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const file of tsFilesUnder(root)) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        for (const match of line.matchAll(RELATIVE_IMPORT)) {
          const specifier = match[1] ?? match[2];
          if (!HAS_EXTENSION.test(specifier)) offenders.push(`${file}:${i + 1} → "${specifier}"`);
        }
      });
    }
  }

  assert.deepEqual(offenders, [], `extensionless relative imports:\n  ${offenders.join("\n  ")}`);
});
