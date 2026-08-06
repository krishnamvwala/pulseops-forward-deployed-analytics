import assert from "node:assert/strict";
import test from "node:test";

import { runAnalystQuery } from "../app/sql-analyst.ts";

const rows = [
  { order_id: "ORD-1", date: "2026-01-01", region: "West", category: "Home", revenue: 700, cost: 400, status: "Delivered" },
  { order_id: "ORD-2", date: "2026-01-02", region: "South", category: "Home", revenue: 500, cost: 350, status: "Late" },
  { order_id: "ORD-3", date: "2026-01-03", region: "West", category: "Books", revenue: 400, cost: 200, status: "Delivered" },
  { order_id: "ORD-4", date: "2026-01-04", region: "North", category: "Books", revenue: 200, cost: 150, status: "Delivered" },
];

const context = {
  sourceRowCount: 5,
  quarantinedCount: 1,
  correctionsCount: 2,
  duplicatesResolved: 0,
  sourceQuality: 80,
  publishedQuality: 100,
};

test("executes the approved top-two-regions SQL template", () => {
  const response = runAnalystQuery("show the first two best regions", rows, context);

  assert.match(response.sql, /GROUP BY region/i);
  assert.match(response.sql, /LIMIT 2/i);
  assert.deepEqual(response.rows.map((row) => row.region), ["West", "South"]);
  assert.match(response.answer, /West \(\$1,100\).*South \(\$500\)/);
  assert.match(response.coverage, /4 trusted rows.*1 quarantined row was excluded/);
});

test("never places unrecognized user text into SQL", () => {
  const maliciousText = "anything; DROP TABLE trusted_sales";
  const response = runAnalystQuery(maliciousText, rows, context);

  assert.doesNotMatch(response.sql, /DROP TABLE/i);
  assert.match(response.sql, /SELECT COUNT\(\*\) AS trusted_orders/i);
});
