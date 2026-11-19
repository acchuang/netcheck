import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHeaders } from "../src/shared/headers-grade.ts";

const STRONG_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-abc123'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), camera=()",
  "cross-origin-opener-policy": "same-origin",
};

function statusOf(headers: Record<string, string>, key: string) {
  return evaluateHeaders(headers).checks.find((c) => c.key === key)!;
}

test("all 7 strong headers score 7/7 A with 0 missing and 0 weak", () => {
  const res = evaluateHeaders(STRONG_HEADERS);
  assert.equal(res.grade, "A");
  assert.deepEqual(res.score, { present: 7, passed: 7, weak: 0, missing: 0, total: 7 });
  for (const c of res.checks.filter((x) => x.graded)) {
    assert.equal(c.status, "pass", c.key);
  }
});

test("HSTS grades max-age=0 and short max-age as warn, >=180 days as pass", () => {
  const zero = statusOf({ ...STRONG_HEADERS, "strict-transport-security": "max-age=0" }, "strict-transport-security");
  assert.equal(zero.status, "warn");
  assert.equal(zero.reasonKey, "headers.weak.hstsZero");

  const short = statusOf({ ...STRONG_HEADERS, "strict-transport-security": "max-age=86400" }, "strict-transport-security");
  assert.equal(short.status, "warn");
  assert.equal(short.reasonKey, "headers.weak.hstsShort");
  assert.equal(short.reasonArg, "86400");

  const boundary = statusOf({ ...STRONG_HEADERS, "strict-transport-security": "max-age=15552000" }, "strict-transport-security");
  assert.equal(boundary.status, "pass");
});

test("CSP flags unsafe-eval, un-neutralized unsafe-inline, and wildcard, but allows nonce/hash unsafe-inline", () => {
  assert.equal(
    statusOf({ ...STRONG_HEADERS, "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-eval'" }, "content-security-policy").reasonKey,
    "headers.weak.cspUnsafeEval"
  );
  assert.equal(
    statusOf({ ...STRONG_HEADERS, "content-security-policy": "default-src 'self' 'unsafe-inline'" }, "content-security-policy").reasonKey,
    "headers.weak.cspUnsafeInline"
  );
  assert.equal(
    statusOf({ ...STRONG_HEADERS, "content-security-policy": "script-src 'self' 'unsafe-inline' 'nonce-xyz'" }, "content-security-policy").status,
    "pass"
  );
  assert.equal(
    statusOf({ ...STRONG_HEADERS, "content-security-policy": "script-src 'self' 'unsafe-inline' 'sha256-deadbeef'" }, "content-security-policy").status,
    "pass"
  );
  assert.equal(
    statusOf({ ...STRONG_HEADERS, "content-security-policy": "script-src https: *" }, "content-security-policy").reasonKey,
    "headers.weak.cspWildcard"
  );
});

test("XFO passes when CSP frame-ancestors is restrictive, even if XFO is missing or invalid; wildcard * does not", () => {
  const withoutXfo = { ...STRONG_HEADERS };
  delete withoutXfo["x-frame-options"];
  const viaCsp = statusOf(withoutXfo, "x-frame-options");
  assert.equal(viaCsp.status, "pass");
  assert.equal(viaCsp.present, false);
  assert.equal(viaCsp.reasonKey, "headers.note.cspFrameAncestors");

  const withBadXfo = { ...STRONG_HEADERS, "x-frame-options": "ALLOWALL" };
  assert.equal(statusOf(withBadXfo, "x-frame-options").status, "pass");

  const wildcardCsp = {
    ...withoutXfo,
    "content-security-policy": "default-src 'self'; frame-ancestors *",
  };
  assert.equal(statusOf(wildcardCsp, "x-frame-options").status, "fail");
});

test("XCTO, Referrer-Policy, Permissions-Policy, and COOP grade directive quality", () => {
  assert.equal(statusOf({ ...STRONG_HEADERS, "x-content-type-options": "bad" }, "x-content-type-options").status, "warn");
  assert.equal(statusOf({ ...STRONG_HEADERS, "referrer-policy": "no-referrer, unsafe-url" }, "referrer-policy").reasonKey, "headers.weak.referrerUnsafe");
  assert.equal(statusOf({ ...STRONG_HEADERS, "referrer-policy": "unsafe-url, strict-origin" }, "referrer-policy").status, "pass");
  assert.equal(statusOf({ ...STRONG_HEADERS, "referrer-policy": "bogus" }, "referrer-policy").reasonKey, "headers.weak.referrerInvalid");
  assert.equal(statusOf({ ...STRONG_HEADERS, "cross-origin-opener-policy": "unsafe-none" }, "cross-origin-opener-policy").reasonKey, "headers.weak.coopWeak");
  assert.equal(statusOf({ ...STRONG_HEADERS, "cross-origin-opener-policy": "same-origin-allow-popups" }, "cross-origin-opener-policy").status, "pass");

  const emptyPerms = { ...STRONG_HEADERS, "permissions-policy": "   " };
  assert.equal(statusOf(emptyPerms, "permissions-policy").status, "fail");
});

test("ungraded COEP, CORP, and X-XSS-Protection never affect grade or score", () => {
  const baseline = evaluateHeaders(STRONG_HEADERS);
  const withInformational = evaluateHeaders({
    ...STRONG_HEADERS,
    "cross-origin-embedder-policy": "require-corp",
    "cross-origin-resource-policy": "same-origin",
    "x-xss-protection": "1; mode=block",
  });
  assert.equal(withInformational.grade, baseline.grade);
  assert.deepEqual(withInformational.score, baseline.score);

  const xss = withInformational.checks.find((c) => c.key === "x-xss-protection")!;
  assert.equal(xss.graded, false);
  assert.equal(xss.status, "info");
  assert.equal(xss.reasonKey, "headers.note.xssLegacy");
});

test("grade ladder runs monotonically A -> B -> C -> D -> F", () => {
  const ladderHeaders: Record<string, string> = {
    ...STRONG_HEADERS,
    "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-abc123'",
  };
  const keys = Object.keys(ladderHeaders);
  const pick = (n: number) => Object.fromEntries(keys.slice(0, n).map((k) => [k, ladderHeaders[k]]));

  assert.equal(evaluateHeaders(pick(7)).grade, "A");
  assert.equal(evaluateHeaders(pick(6)).grade, "A");
  // 5 pass + 2 weak = 6.0 points, but passed < 6 -> capped at B
  assert.equal(evaluateHeaders({
    ...pick(4),
    "referrer-policy": "unsafe-url",
    "permissions-policy": "geolocation=()",
    "cross-origin-opener-policy": "unsafe-none",
  }).grade, "B");
  assert.equal(evaluateHeaders(pick(5)).grade, "B");
  assert.equal(evaluateHeaders(pick(4)).grade, "C");
  assert.equal(evaluateHeaders(pick(3)).grade, "D");
  assert.equal(evaluateHeaders(pick(2)).grade, "D");
  assert.equal(evaluateHeaders(pick(1)).grade, "F");
  assert.equal(evaluateHeaders({}).grade, "F");
});
