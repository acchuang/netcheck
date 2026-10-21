import { test } from "node:test";
import assert from "node:assert/strict";
import { html, raw } from "../src/client/html.ts";

test("html escapes interpolated values", () => {
  const evil = `<script>alert("x")</script>'&`;
  assert.equal(
    html`<p title="${evil}">${evil}</p>`.value,
    `<p title="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;&amp;">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;&amp;</p>`
  );
});

test("nested html and raw are not double-escaped", () => {
  const inner = html`<b>${"a<b"}</b>`;
  assert.equal(html`<i>${inner}</i>${raw("<br>")}`.value, "<i><b>a&lt;b</b></i><br>");
});

test("arrays join, each item escaped", () => {
  const rows = ["<1>", "2"].map((n) => html`<li>${n}</li>`);
  assert.equal(html`<ul>${rows}</ul>`.value, "<ul><li>&lt;1&gt;</li><li>2</li></ul>");
  assert.equal(html`${["<", ">"]}`.value, "&lt;&gt;");
});

test("null and undefined render empty", () => {
  assert.equal(html`[${null}][${undefined}][${0}]`.value, "[][][0]");
});
