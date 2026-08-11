import assert from "node:assert/strict";
import test from "node:test";

import { runEtl } from "../app/etl.ts";
import { buildAgentPipelineImport, issueCodeForProblem } from "../app/pulseops-agent.ts";

const rawRecords = [
  {
    sourceRow: 2,
    values: {
      order_id: " ord-1 ",
      date: "01/05/2026",
      region: "north",
      category: "books",
      revenue: "1,200.00",
      cost: "800",
      status: "completed",
    },
  },
  {
    sourceRow: 3,
    values: {
      order_id: "ORD-2",
      date: "2026-01-06",
      region: "South",
      category: "Home",
      revenue: "",
      cost: "400",
      status: "Pending",
    },
  },
];

test("preserves source-to-trusted and quarantine lineage for the agent import", () => {
  const result = runEtl(rawRecords);
  const payload = buildAgentPipelineImport("sales.csv", rawRecords, result);

  assert.equal(payload.source_records.length, 2);
  assert.deepEqual(payload.trusted_records, [{
    source_row: 2,
    order_id: "ORD-1",
    order_date: "2026-01-05",
    region: "North",
    category: "Books",
    revenue: 1200,
    cost: 800,
    status: "Completed",
  }]);
  assert.equal(payload.quarantine_records[0].source_row, 3);
  assert.deepEqual(payload.quarantine_records[0].issue_codes, ["MISSING_REVENUE"]);
});

test("maps outlier messages to a stable governed issue code", () => {
  assert.equal(issueCodeForProblem({
    field: "revenue",
    value: "99999999",
    message: "Revenue outlier: $99,999,999 exceeds configured maximum of $100,000",
  }), "REVENUE_OUTLIER");
});
