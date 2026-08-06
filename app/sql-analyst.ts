import alasql from "alasql";

import type { SalesRow } from "./etl";

export type QueryValue = string | number;

export type QueryColumn = {
  key: string;
  label: string;
  format: "text" | "currency" | "number" | "percent";
};

export type AnalystContext = {
  sourceRowCount: number;
  quarantinedCount: number;
  correctionsCount: number;
  duplicatesResolved: number;
  sourceQuality: number;
  publishedQuality: number;
};

export type AnalystResponse = {
  answer: string;
  template: string;
  sql: string;
  rows: Record<string, QueryValue>[];
  columns: QueryColumn[];
  coverage: string;
};

type RegionResult = {
  region: string;
  total_revenue: number;
  order_count: number;
};

type CategoryResult = {
  category: string;
  order_count: number;
  total_revenue: number;
  gross_margin_pct: number;
};

type LateOrderResult = {
  region: string;
  late_orders: number;
};

type OverviewResult = {
  trusted_orders: number;
  total_revenue: number;
  gross_margin_pct: number;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

function requestedLimit(question: string, fallback: number) {
  const match = question.match(/\b(?:top|first)\s+(one|two|three|four|five|\d+)\b/)
    ?? question.match(/\b(one|two|three|four|five|\d+)\s+(?:best|top)\b/);
  if (!match) return fallback;

  const requested = numberWords[match[1]] ?? Number(match[1]);
  return Math.min(Math.max(requested, 1), 5);
}

function listWithAnd(values: string[]) {
  if (values.length < 2) return values[0] ?? "No result";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function createTrustedDatabase(rows: SalesRow[]) {
  const database = new alasql.Database();
  database.exec(
    "CREATE TABLE trusted_sales (order_id STRING, [date] STRING, region STRING, category STRING, revenue NUMBER, cost NUMBER, status STRING)",
  );
  database.exec("INSERT INTO trusted_sales SELECT * FROM ?", [rows]);
  return database;
}

function coverage(rows: SalesRow[], context: AnalystContext) {
  const excluded = context.quarantinedCount
    ? ` ${context.quarantinedCount} quarantined row${context.quarantinedCount === 1 ? " was" : "s were"} excluded.`
    : " No rows were excluded.";
  return `SQL ran against ${rows.length} trusted row${rows.length === 1 ? "" : "s"}.${excluded}`;
}

export function runAnalystQuery(
  question: string,
  rows: SalesRow[],
  context: AnalystContext,
): AnalystResponse {
  const normalized = question.trim().toLowerCase();
  const database = createTrustedDatabase(rows);
  const queryCoverage = coverage(rows, context);

  if (/\bregions?\b/.test(normalized)) {
    const limit = requestedLimit(normalized, /\b(top|best|first)\b/.test(normalized) ? 2 : 1);
    const sql = `SELECT region,
       ROUND(SUM(revenue), 2) AS total_revenue,
       COUNT(*) AS order_count
FROM trusted_sales
GROUP BY region
ORDER BY total_revenue DESC
LIMIT ${limit};`;
    const results = database.exec<RegionResult[]>(sql);
    const rankedRegions = results.map(
      (result) => `${result.region} (${money.format(result.total_revenue)})`,
    );

    return {
      answer: `${listWithAnd(rankedRegions)} ${results.length === 1 ? "leads" : "are the top regions"} by revenue in the trusted dataset.`,
      template: `${results.length === 1 ? "Leading region" : `Top ${results.length} regions`} by revenue`,
      sql,
      rows: results,
      columns: [
        { key: "region", label: "Region", format: "text" },
        { key: "total_revenue", label: "Revenue", format: "currency" },
        { key: "order_count", label: "Orders", format: "number" },
      ],
      coverage: queryCoverage,
    };
  }

  if (/\b(categories|category|margin)\b/.test(normalized)) {
    const limit = requestedLimit(normalized, /\b(top|best|first)\b/.test(normalized) ? 2 : 1);
    const sql = `SELECT category,
       COUNT(*) AS order_count,
       ROUND(SUM(revenue), 2) AS total_revenue,
       ROUND(((SUM(revenue) - SUM(cost)) / SUM(revenue)) * 100, 1) AS gross_margin_pct
FROM trusted_sales
GROUP BY category
ORDER BY gross_margin_pct DESC
LIMIT ${limit};`;
    const results = database.exec<CategoryResult[]>(sql);
    const rankedCategories = results.map(
      (result) => `${result.category} (${result.gross_margin_pct.toFixed(1)}%)`,
    );

    return {
      answer: `${listWithAnd(rankedCategories)} ${results.length === 1 ? "has" : "have"} the strongest gross margin in the trusted dataset.`,
      template: `${results.length === 1 ? "Leading category" : `Top ${results.length} categories`} by margin`,
      sql,
      rows: results,
      columns: [
        { key: "category", label: "Category", format: "text" },
        { key: "gross_margin_pct", label: "Margin", format: "percent" },
        { key: "total_revenue", label: "Revenue", format: "currency" },
        { key: "order_count", label: "Orders", format: "number" },
      ],
      coverage: queryCoverage,
    };
  }

  if (/\b(late|delayed|operations?|focus)\b/.test(normalized)) {
    const sql = `SELECT region,
       COUNT(*) AS late_orders
FROM trusted_sales
WHERE LOWER(status) = 'late'
GROUP BY region
ORDER BY late_orders DESC, region ASC;`;
    const results = database.exec<LateOrderResult[]>(sql);
    const totalLateOrders = results.reduce((total, result) => total + result.late_orders, 0);
    const firstRegion = results[0];
    const answer = firstRegion
      ? `${totalLateOrders} trusted orders are late. ${firstRegion.region} has the highest late-order count (${firstRegion.late_orders}), so that is the first region to investigate.`
      : "No late orders appear in the trusted dataset.";

    return {
      answer,
      template: "Late orders by region",
      sql,
      rows: results,
      columns: [
        { key: "region", label: "Region", format: "text" },
        { key: "late_orders", label: "Late orders", format: "number" },
      ],
      coverage: queryCoverage,
    };
  }

  if (/\b(quality|issues?|trust|quarantin)\b/.test(normalized)) {
    const sql = `SELECT COUNT(*) AS trusted_rows
FROM trusted_sales;`;
    const results = database.exec<Record<string, QueryValue>[]>(sql);

    return {
      answer: `Source quality was ${context.sourceQuality}% and published quality is ${context.publishedQuality}%. The pipeline corrected ${context.correctionsCount} values, resolved ${context.duplicatesResolved} exact duplicate${context.duplicatesResolved === 1 ? "" : "s"}, and quarantined ${context.quarantinedCount} risky row${context.quarantinedCount === 1 ? "" : "s"}.`,
      template: "Trusted-row count and pipeline quality",
      sql,
      rows: results,
      columns: [{ key: "trusted_rows", label: "Trusted rows", format: "number" }],
      coverage: queryCoverage,
    };
  }

  const sql = `SELECT COUNT(*) AS trusted_orders,
       ROUND(SUM(revenue), 2) AS total_revenue,
       ROUND(((SUM(revenue) - SUM(cost)) / SUM(revenue)) * 100, 1) AS gross_margin_pct
FROM trusted_sales;`;
  const results = database.exec<OverviewResult[]>(sql);
  const overview = results[0] ?? { trusted_orders: 0, total_revenue: 0, gross_margin_pct: 0 };

  return {
    answer: `The published dataset contains ${overview.trusted_orders} trusted orders and ${money.format(overview.total_revenue)} in revenue at a ${overview.gross_margin_pct.toFixed(1)}% gross margin. Try asking for the top 2 regions, best categories, late orders, or data quality.`,
    template: "Trusted dataset overview",
    sql,
    rows: results,
    columns: [
      { key: "trusted_orders", label: "Trusted orders", format: "number" },
      { key: "total_revenue", label: "Revenue", format: "currency" },
      { key: "gross_margin_pct", label: "Margin", format: "percent" },
    ],
    coverage: queryCoverage,
  };
}
