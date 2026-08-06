import assert from "node:assert/strict";
import test from "node:test";

import { createSalesCsv, extractCsv, runEtl, validateManualCorrection } from "../app/etl.ts";

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
  assert.ok(result.issues.some((item) => item.message === "Invalid or unsupported date format"));
  assert.ok(result.issues.some((item) => item.message === "Cost exceeds revenue"));
  assert.ok(result.issues.some((item) => item.message === "Conflicting duplicate order ID"));
  assert.ok(result.quarantinedRecords.some((item) => item.orderId === "ORD-4" && item.problems[0].value === "not-a-date"));
  assert.equal(result.publishedQualityScore, 100);

  const cleaned = createSalesCsv(result.rows);
  assert.match(cleaned, /ORD-1,2026-07-21,West,Beverages,1200,800,Delivered/);
  assert.doesNotMatch(cleaned, /not-a-date|-50/);
});

test("explains impossible dates without guessing a replacement", () => {
  const impossibleDates = `order_id,date,region,category,revenue,cost,status
ORD-1004,2026-13-01,West,Sports,700,400,Shipped
ORD-1005,2026-02-30,North,Clothing,650,300,Pending
ORD-1006,2026-01-15,North,Electronics,1200,900,Completed`;
  const extracted = extractCsv(impossibleDates);
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  const result = runEtl(extracted.records);
  assert.deepEqual(result.rows.map((row) => row.order_id), ["ORD-1006"]);
  assert.equal(result.quarantinedRecords.length, 2);
  assert.deepEqual(
    result.quarantinedRecords.map((record) => ({
      orderId: record.orderId,
      value: record.problems[0].value,
      message: record.problems[0].message,
    })),
    [
      { orderId: "ORD-1004", value: "2026-13-01", message: "Invalid date: month 13 does not exist" },
      { orderId: "ORD-1005", value: "2026-02-30", message: "Invalid date: February 2026 has 28 days" },
    ],
  );
});

test("rejects files that do not meet the data contract", () => {
  const extracted = extractCsv("order_id,date\nORD-1,2026-07-21");
  assert.equal(extracted.ok, false);
  if (extracted.ok) return;
  assert.match(extracted.error, /Missing required columns/);
});

test("publishes a manually corrected quarantined row and preserves its audit changes", () => {
  const correctionCsv = `order_id,date,region,category,revenue,cost,status
ORD-1,2026-07-21,West,Beverages,1200,800,Delivered
ORD-2,2026-07-22,South,Snacks,,400,Delivered`;
  const extracted = extractCsv(correctionCsv);
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  const currentResult = runEtl(extracted.records);
  const sourceRecord = extracted.records.find((record) => record.sourceRow === 3);
  assert.ok(sourceRecord);

  const correction = validateManualCorrection(
    extracted.records,
    currentResult,
    3,
    { ...sourceRecord.values, revenue: "700" },
  );

  assert.equal(correction.ok, true);
  if (!correction.ok) return;
  assert.equal(correction.result.rows.length, 2);
  assert.equal(correction.result.quarantinedRows, 0);
  assert.equal(correction.trustedRowsAdded, 1);
  assert.deepEqual(correction.changes, [{ field: "revenue", before: "", after: "700" }]);
  assert.equal(extracted.records[1].values.revenue, "");
});

test("keeps an unresolved manual correction in quarantine", () => {
  const extracted = extractCsv(`order_id,date,region,category,revenue,cost,status
ORD-1,2026-13-01,West,Sports,700,400,Shipped`);
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  const currentResult = runEtl(extracted.records);
  const correction = validateManualCorrection(
    extracted.records,
    currentResult,
    2,
    { ...extracted.records[0].values, region: "South" },
  );

  assert.equal(correction.ok, false);
  if (correction.ok) return;
  assert.match(correction.message, /still fails the data contract/);
  assert.equal(correction.problems[0].field, "date");
  assert.match(correction.problems[0].message, /month 13/);
});

test("does not publish a manual correction that becomes an exact duplicate", () => {
  const extracted = extractCsv(`order_id,date,region,category,revenue,cost,status
ORD-1,2026-07-21,West,Beverages,1200,800,Delivered
ORD-2,2026-07-22,South,Snacks,-50,20,Delivered`);
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  const currentResult = runEtl(extracted.records);
  const correction = validateManualCorrection(
    extracted.records,
    currentResult,
    3,
    { ...extracted.records[0].values },
  );

  assert.equal(correction.ok, false);
  if (correction.ok) return;
  assert.match(correction.message, /removed as a duplicate/);
});
