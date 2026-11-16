import { test } from "node:test";
import assert from "node:assert/strict";
import { rdapCountry } from "../src/shared/rdap.ts";

test("takes the ISO code APNIC/RIPE/LACNIC/AFRINIC send", () => {
  assert.equal(rdapCountry({ country: "au" }), "AU");
});

test("falls back to ARIN's registrant postal label", () => {
  const body = {
    entities: [
      { roles: ["abuse"], vcardArray: ["vcard", [["adr", { label: "x\nCanada" }, "text", ""]]] },
      { roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "Google LLC"], ["adr", { label: "1600 Amphitheatre Pkwy\nMountain View\nCA\n94043\nUnited States" }, "text", ""]]] },
    ],
  };
  assert.equal(rdapCountry(body), "US");
});

test("null when nothing says", () => {
  assert.equal(rdapCountry({ entities: [] }), null);
  assert.equal(rdapCountry(null), null);
  assert.equal(rdapCountry({ country: "Unknown" }), null);
});
