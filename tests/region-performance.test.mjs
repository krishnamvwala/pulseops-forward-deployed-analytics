import assert from "node:assert/strict";
import test from "node:test";

import { getRegionPerformanceBand } from "../app/region-performance.mjs";

test("uses revenue thresholds instead of rank for regional performance bands", () => {
  assert.equal(getRegionPerformanceBand(100, 100).band, "leader");
  assert.equal(getRegionPerformanceBand(95, 100).band, "leader");
  assert.equal(getRegionPerformanceBand(75, 100).band, "strong");
  assert.equal(getRegionPerformanceBand(50, 100).band, "watch");
  assert.equal(getRegionPerformanceBand(49, 100).band, "attention");
});

test("does not flag a nearly equal fourth-ranked region as attention", () => {
  const regions = [100, 99, 98, 97].map((value) => getRegionPerformanceBand(value, 100));

  assert.deepEqual(regions.map(({ band }) => band), ["leader", "leader", "leader", "leader"]);
});
