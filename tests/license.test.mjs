import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("documents portfolio evaluation rights and commercial restrictions", async () => {
  const license = await readFile(new URL("../LICENSE", import.meta.url), "utf8");

  assert.match(license, /Copyright © 2026 Krishna Mvwala\. All rights reserved\./);
  assert.match(license, /non-commercial portfolio review, recruitment/);
  assert.match(license, /commercial product/);
  assert.match(license, /present the Software.*another[\s\S]*person's original work/);
  assert.match(license, /not an open-source license/);
});
