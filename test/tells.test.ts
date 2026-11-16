// A tell that fires on an ordinary connection teaches people to ignore the
// panel, so most of these pin the quiet cases as hard as the loud ones.

import { test } from "node:test";
import assert from "node:assert/strict";
import { utcOffsetMinutes, timezoneTell, rttTell, languageTell, resolverCountryTell } from "../src/shared/tells.ts";

const WINTER = new Date("2026-01-15T12:00:00Z");
const SUMMER = new Date("2026-07-15T12:00:00Z");

test("offsets follow DST and handle half-hour zones", () => {
  assert.equal(utcOffsetMinutes("Europe/London", WINTER), 0);
  assert.equal(utcOffsetMinutes("Europe/London", SUMMER), 60);
  assert.equal(utcOffsetMinutes("Asia/Kolkata", WINTER), 330);
  assert.equal(utcOffsetMinutes("America/New_York", WINTER), -300);
  assert.equal(utcOffsetMinutes("UTC", WINTER), 0);
  assert.equal(utcOffsetMinutes("Not/AZone", WINTER), null);
});

test("timezone: same clock under different names is not a tell", () => {
  assert.equal(timezoneTell("Europe/Paris", "Europe/Berlin", WINTER).status, "ok");
  assert.equal(timezoneTell("Europe/London", "Europe/Paris", WINTER).status, "ok"); // 1h: border, not a tell
});

test("timezone: a clock hours away from the IP warns", () => {
  const t = timezoneTell("America/New_York", "Asia/Taipei", WINTER);
  assert.equal(t.status, "warn");
  assert.equal(t.network, "America/New_York (UTC-5)");
  assert.equal(t.browser, "Asia/Taipei (UTC+8)");
  assert.equal(timezoneTell("Asia/Kolkata", "UTC", WINTER).browser, "UTC (UTC+0)");
});

test("timezone: a missing side is unknown, never ok", () => {
  assert.equal(timezoneTell(null, "Asia/Taipei").status, "unknown");
  assert.equal(timezoneTell("Asia/Taipei", "Bogus/Zone").status, "unknown");
});

test("rtt: a long browser trip over a short edge hop warns", () => {
  assert.equal(rttTell(240, 12).status, "warn");    // proxy terminates TCP
  assert.equal(rttTell(30, 12).status, "ok");       // ratio high, gap small
  assert.equal(rttTell(320, 250).status, "ok");     // slow link, gap large, ratio low
});

test("rtt: no clientTcpRtt (HTTP/3) is unknown, not a pass", () => {
  assert.equal(rttTell(80, null).status, "unknown");
  assert.equal(rttTell(80, 0).status, "unknown");
  assert.equal(rttTell(null, 20).status, "unknown");
});

test("language: never warns, only notes a missing country", () => {
  assert.equal(languageTell(["zh-TW", "en-US"], "TW").status, "ok");
  assert.equal(languageTell(["en-US"], "DE").status, "info");
  assert.equal(languageTell(["en"], "DE").status, "unknown");   // no region to compare
  assert.equal(languageTell(["en-US"], "T1").status, "unknown"); // Tor
  assert.equal(languageTell(["de-DE"], "de").status, "ok");
});

test("resolver country: nothing observed drops the row", () => {
  assert.equal(resolverCountryTell([], "TW"), null);
});

test("resolver country: an ISP resolver abroad warns, a public operator is skipped", () => {
  const leak = resolverCountryTell([{ ip: "203.0.113.5", country: "TW" }], "US");
  assert.equal(leak?.status, "warn");
  assert.equal(leak?.browser, "203.0.113.5 (TW)");
  // 8.8.8.8 is registered in the US wherever it answers from.
  assert.equal(resolverCountryTell([{ ip: "8.8.8.8", country: "US" }], "TW")?.status, "unknown");
  assert.equal(resolverCountryTell([{ ip: "203.0.113.5", country: "tw" }], "TW")?.status, "ok");
  assert.equal(resolverCountryTell([{ ip: "203.0.113.5", country: null }], "TW")?.status, "unknown");
});
