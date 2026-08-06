export const requiredColumns = [
  "order_id",
  "date",
  "region",
  "category",
  "revenue",
  "cost",
  "status",
] as const;

export type RequiredColumn = (typeof requiredColumns)[number];

export type SalesRow = {
  order_id: string;
  date: string;
  region: string;
  category: string;
  revenue: number;
  cost: number;
  status: string;
};

export type RawSalesRecord = {
  sourceRow: number;
  values: Record<RequiredColumn, string>;
};

export type DataIssue = {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
  action: "quarantined" | "removed";
};

export type DataCorrection = {
  row: number;
  field: string;
  before: string;
  after: string;
  reason: "Text normalization" | "Date normalization" | "Numeric normalization";
};

export type QuarantinedProblem = {
  field: string;
  value: string;
  message: string;
};

export type QuarantinedRecord = {
  sourceRow: number;
  orderId: string;
  problems: QuarantinedProblem[];
};

export type EtlResult = {
  rows: SalesRow[];
  issues: DataIssue[];
  corrections: DataCorrection[];
  quarantinedRecords: QuarantinedRecord[];
  duplicatesResolved: number;
  quarantinedRows: number;
  sourceQualityScore: number;
  publishedQualityScore: number;
};

export type ExtractResult =
  | { ok: true; records: RawSalesRecord[]; rowCount: number }
  | { ok: false; error: string };

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function extractCsv(content: string): ExtractResult {
  const lines = content.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    return { ok: false, error: "The file needs a header and at least one data row." };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length) {
    return { ok: false, error: `Missing required columns: ${missingColumns.join(", ")}` };
  }

  const records = lines.slice(1).map((line, index) => {
    const parsedValues = parseCsvLine(line);
    const values = Object.fromEntries(
      requiredColumns.map((column) => [column, parsedValues[headers.indexOf(column)] ?? ""]),
    ) as Record<RequiredColumn, string>;

    return { sourceRow: index + 2, values };
  });

  return { ok: true, records, rowCount: records.length };
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeText(field: "order_id" | "region" | "category" | "status", raw: string) {
  const compact = raw.trim().replace(/\s+/g, " ");
  if (!compact) return "";
  if (field === "order_id") return compact.toUpperCase();

  const aliasKey = compact.toLowerCase().replace(/[\s_-]+/g, "");
  const aliases: Record<string, string> = {
    ne: "Northeast",
    northeast: "Northeast",
    mw: "Midwest",
    midwest: "Midwest",
    south: "South",
    west: "West",
    personalcare: "Personal Care",
    household: "Household",
    beverages: "Beverages",
    snacks: "Snacks",
    delivered: "Delivered",
    ontime: "Delivered",
    complete: "Delivered",
    late: "Late",
    delayed: "Late",
  };

  return aliases[aliasKey] ?? titleCase(compact);
}

function parseFinancialValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false as const };

  const isParenthetical = /^\(.*\)$/.test(trimmed);
  const unwrapped = isParenthetical ? trimmed.slice(1, -1) : trimmed;
  const normalized = unwrapped.replace(/[$,\s]/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) return { ok: false as const };

  const parsed = Number(normalized) * (isParenthetical ? -1 : 1);
  if (!Number.isFinite(parsed)) return { ok: false as const };

  return {
    ok: true as const,
    value: parsed,
    display: String(parsed),
    changed: trimmed !== String(parsed),
  };
}

function validIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateValue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const yearFirst = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (yearFirst) {
    return validIsoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  }

  const monthFirst = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (monthFirst) {
    return validIsoDate(Number(monthFirst[3]), Number(monthFirst[1]), Number(monthFirst[2]));
  }

  if (/[A-Za-z]/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.valueOf())) {
      return validIsoDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
    }
  }

  return null;
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function invalidDateMessage(raw: string) {
  const trimmed = raw.trim();
  const yearFirst = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const monthFirst = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  const year = yearFirst ? Number(yearFirst[1]) : monthFirst ? Number(monthFirst[3]) : null;
  const month = yearFirst ? Number(yearFirst[2]) : monthFirst ? Number(monthFirst[1]) : null;
  const day = yearFirst ? Number(yearFirst[3]) : monthFirst ? Number(monthFirst[2]) : null;

  if (year === null || month === null || day === null) {
    return "Invalid or unsupported date format";
  }
  if (month < 1 || month > 12) {
    return `Invalid date: month ${month} does not exist`;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    return `Invalid date: ${monthNames[month - 1]} ${year} has ${daysInMonth} days`;
  }

  return "Invalid or unsupported date format";
}

function issueValue(record: RawSalesRecord, field: string) {
  if (field === "revenue / cost") {
    return `revenue=${record.values.revenue || "(blank)"}, cost=${record.values.cost || "(blank)"}`;
  }
  if ((requiredColumns as readonly string[]).includes(field)) {
    return record.values[field as RequiredColumn].trim() || "(blank)";
  }
  return "(not available)";
}

function calculateSourceQuality(issues: DataIssue[], corrections: DataCorrection[], duplicatesResolved: number) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return Math.max(0, 100 - errors * 8 - warnings * 3 - corrections.length * 2 - duplicatesResolved * 5);
}

export function runEtl(records: RawSalesRecord[]): EtlResult {
  const rows: SalesRow[] = [];
  const issues: DataIssue[] = [];
  const corrections: DataCorrection[] = [];
  const quarantined = new Set<number>();
  const seenOrderIds = new Map<string, string>();
  let duplicatesResolved = 0;

  for (const record of records) {
    const row = record.sourceRow;
    const rowCorrections: DataCorrection[] = [];
    const normalizedText = {
      order_id: normalizeText("order_id", record.values.order_id),
      region: normalizeText("region", record.values.region),
      category: normalizeText("category", record.values.category),
      status: normalizeText("status", record.values.status),
    };

    for (const field of ["order_id", "region", "category", "status"] as const) {
      const before = record.values[field];
      const after = normalizedText[field];
      if (before && before !== after) {
        rowCorrections.push({ row, field, before, after, reason: "Text normalization" });
      }
    }

    for (const field of requiredColumns) {
      if (!record.values[field].trim()) {
        issues.push({
          row,
          field,
          message: "Required value is missing",
          severity: "error",
          action: "quarantined",
        });
        quarantined.add(row);
      }
    }

    const revenue = parseFinancialValue(record.values.revenue);
    const cost = parseFinancialValue(record.values.cost);
    if (record.values.revenue.trim() && !revenue.ok) {
      issues.push({ row, field: "revenue", message: "Expected a numeric value", severity: "error", action: "quarantined" });
      quarantined.add(row);
    }
    if (record.values.cost.trim() && !cost.ok) {
      issues.push({ row, field: "cost", message: "Expected a numeric value", severity: "error", action: "quarantined" });
      quarantined.add(row);
    }

    if (revenue.ok && revenue.changed) {
      rowCorrections.push({ row, field: "revenue", before: record.values.revenue, after: revenue.display, reason: "Numeric normalization" });
    }
    if (cost.ok && cost.changed) {
      rowCorrections.push({ row, field: "cost", before: record.values.cost, after: cost.display, reason: "Numeric normalization" });
    }

    if ((revenue.ok && revenue.value < 0) || (cost.ok && cost.value < 0)) {
      issues.push({ row, field: "revenue / cost", message: "Negative financial value", severity: "error", action: "quarantined" });
      quarantined.add(row);
    } else if (revenue.ok && cost.ok && cost.value > revenue.value) {
      issues.push({ row, field: "cost", message: "Cost exceeds revenue", severity: "error", action: "quarantined" });
      quarantined.add(row);
    }

    const normalizedDate = parseDateValue(record.values.date);
    if (record.values.date.trim() && !normalizedDate) {
      issues.push({ row, field: "date", message: invalidDateMessage(record.values.date), severity: "error", action: "quarantined" });
      quarantined.add(row);
    } else if (normalizedDate && record.values.date !== normalizedDate) {
      rowCorrections.push({ row, field: "date", before: record.values.date, after: normalizedDate, reason: "Date normalization" });
    }

    if (quarantined.has(row) || !revenue.ok || !cost.ok || !normalizedDate) continue;

    const transformed: SalesRow = {
      order_id: normalizedText.order_id,
      date: normalizedDate,
      region: normalizedText.region,
      category: normalizedText.category,
      revenue: revenue.value,
      cost: cost.value,
      status: normalizedText.status,
    };
    const canonical = JSON.stringify(transformed);
    const existing = seenOrderIds.get(transformed.order_id);

    if (existing === canonical) {
      issues.push({ row, field: "order_id", message: "Exact duplicate order removed", severity: "warning", action: "removed" });
      duplicatesResolved += 1;
      continue;
    }
    if (existing) {
      issues.push({ row, field: "order_id", message: "Conflicting duplicate order ID", severity: "error", action: "quarantined" });
      quarantined.add(row);
      continue;
    }

    seenOrderIds.set(transformed.order_id, canonical);
    rows.push(transformed);
    corrections.push(...rowCorrections);
  }

  const quarantinedRecords = records
    .filter((record) => quarantined.has(record.sourceRow))
    .map((record) => ({
      sourceRow: record.sourceRow,
      orderId: record.values.order_id.trim() || "Missing order ID",
      problems: issues
        .filter((issue) => issue.row === record.sourceRow && issue.action === "quarantined")
        .map((issue) => ({
          field: issue.field,
          value: issueValue(record, issue.field),
          message: issue.message,
        })),
    }));

  return {
    rows,
    issues,
    corrections,
    quarantinedRecords,
    duplicatesResolved,
    quarantinedRows: quarantined.size,
    sourceQualityScore: calculateSourceQuality(issues, corrections, duplicatesResolved),
    publishedQualityScore: rows.length ? 100 : 0,
  };
}

export function recordsFromSalesRows(rows: SalesRow[]): RawSalesRecord[] {
  return rows.map((row, index) => ({
    sourceRow: index + 2,
    values: {
      order_id: row.order_id,
      date: row.date,
      region: row.region,
      category: row.category,
      revenue: String(row.revenue),
      cost: String(row.cost),
      status: row.status,
    },
  }));
}

function csvValue(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createSalesCsv(rows: SalesRow[]) {
  const lines = rows.map((row) => requiredColumns.map((column) => csvValue(row[column])).join(","));
  return [requiredColumns.join(","), ...lines].join("\n");
}
