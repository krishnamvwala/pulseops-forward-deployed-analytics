import assert from "node:assert/strict";
import test from "node:test";

import { createSalesCsv, extractCsv, runEtl } from "../app/etl.ts";

const messyCsv = `order_id,date,region,category,revenue,cost,status
 ord-1 ,7/21/2026, west , beverages ,"$1,200",800, delivered
ORD-1,2026-07-21,West,Beverages,1200,800,Delivered
ORD-2,2026-07-22,South,Snacks,-50,20,Delivered
,2026-07-23,Midwest,Household,900,500,Late
ORD-4,not-a-date,Northeast,Snacks,700,400,Delivered
ORD-5,2026-07-25,South,Household,400,550,Delivered
ORD-1,2026-07-21,West,Beverages,1300,800,Delivered`;

test("extracts raw CSV without silently transforming it", () => {
  const extracted = extractCsv(messyCsv);
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  assert.equal(extracted.rowCount, 7);
  assert.equal(extracted.records[0].values.order_id, " ord-1 ");
  assert.equal(extracted.records[0].values.revenue, "$1,200");
});

test("corrects safe formatting, removes exact duplicates, and quarantines risky rows", () => {
  const extracted = extractCsv(messyCsv);
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  const result = runEtl(extracted.records);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    order_id: "ORD-1",
    date: "2026-07-21",
    region: "West",
    category: "Beverages",
    revenue: 1200,
    cost: 800,
    status: "Delivered",
  });
  assert.equal(result.duplicatesResolved, 1);
  assert.equal(result.quarantinedRows, 5);
  assert.ok(result.corrections.some((item) => item.field === "date" && item.after === "2026-07-21"));
  assert.ok(result.issues.some((item) => item.message === "Negative financial value"));
  assert.ok(result.issues.some((item) => item.message === "Invalid date format"));
  assert.ok(result.issues.some((item) => item.message === "Cost exceeds revenue"));
  assert.ok(result.issues.some((item) => item.message === "Conflicting duplicate order ID"));
  assert.equal(result.publishedQualityScore, 100);

  const cleaned = createSalesCsv(result.rows);
  assert.match(cleaned, /ORD-1,2026-07-21,West,Beverages,1200,800,Delivered/);
  assert.doesNotMatch(cleaned, /not-a-date|-50/);
});

test("rejects files that do not meet the data contract", () => {
  const extracted = extractCsv("order_id,date\nORD-1,2026-07-21");
  assert.equal(extracted.ok, false);
  if (extracted.ok) return;
  assert.match(extracted.error, /Missing required columns/);
});
