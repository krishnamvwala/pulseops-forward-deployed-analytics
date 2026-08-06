import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the PulseOps ETL workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PulseOps \| Forward-Deployed Analytics Portfolio<\/title>/i);
  assert.match(html, /Retail performance command center/);
  assert.match(html, /Run ETL pipeline/);
  assert.match(html, /Before &amp; after quality/);
  assert.match(html, /Transformation summary/);
  assert.match(html, /Quarantined records/);
  assert.match(html, /Customer correction workflow/);
  assert.match(html, /Correction audit/);
  assert.match(html, /Download cleaned CSV/);
  assert.match(html, /Show the top 2 regions by revenue/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|Building your site/i);
});
