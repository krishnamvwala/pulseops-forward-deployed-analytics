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

export type ManualFieldChange = {
  field: RequiredColumn;
  before: string;
  after: string;
};

export type EtlConfiguration = {
  maxRevenuePerOrder: number;
  statisticalOutliersEnabled: boolean;
  statisticalMinimumRows: number;
  medianMultiplier: number;
  iqrMultiplier: number;
  approvedRevenueOutlierRows: readonly number[];
};

export const defaultEtlConfiguration: EtlConfiguration = {
  maxRevenuePerOrder: 100_000,
  statisticalOutliersEnabled: true,
  statisticalMinimumRows: 20,
  medianMultiplier: 10,
  iqrMultiplier: 3,
  approvedRevenueOutlierRows: [],
};

export type RevenueGuardrailResult = {
  maxRevenuePerOrder: number;
  statisticalOutliersEnabled: boolean;
  statisticalSampleSize: number;
  medianRevenue: number | null;
  statisticalLimit: number | null;
  approvedExceptions: number;
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
  revenueGuardrail: RevenueGuardrailResult;
};

export type ExtractResult =
  | { ok: true; records: RawSalesRecord[]; rowCount: number }
  | { ok: false; error: string };

export type ManualCorrectionResult =
  | {
      ok: true;
      records: RawSalesRecord[];
      result: EtlResult;
      changes: ManualFieldChange[];
      trustedRowsAdded: number;
    }
  | {
      ok: false;
      message: string;
      problems: QuarantinedProblem[];
    };

export type BatchCorrectionRecord = {
  sourceRow: number;
  values: Record<RequiredColumn, string>;
};

export type BatchCorrectionOutcome = {
  sourceRow: number;
  orderId: string;
  changes: ManualFieldChange[];
  outcome: "published" | "quarantined" | "duplicate";
};

export type BatchCorrectionPreview = {
  records: RawSalesRecord[];
  result: EtlResult;
  outcomes: BatchCorrectionOutcome[];
  submittedRows: number;
  changedRows: number;
  publishableRows: number;
  remainingRows: number;
  duplicateRows: number;
  trustedRowsAdded: number;
};

export type BatchCorrectionExtractResult =
  | { ok: true; records: BatchCorrectionRecord[] }
  | { ok: false; error: string };

export type BatchCorrectionPreviewResult =
  | { ok: true; preview: BatchCorrectionPreview }
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

export function extractBatchCorrectionCsv(content: string): BatchCorrectionExtractResult {
  const lines = content.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    return { ok: false, error: "The correction file needs a header and at least one record." };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const requiredBatchColumns = ["source_row", ...requiredColumns];
  const missingColumns = requiredBatchColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length) {
    return { ok: false, error: `Missing correction columns: ${missingColumns.join(", ")}` };
  }

  const seenSourceRows = new Set<number>();
  const records: BatchCorrectionRecord[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const parsedValues = parseCsvLine(lines[index]);
    const sourceRowText = parsedValues[headers.indexOf("source_row")]?.trim() ?? "";
    if (!/^\d+$/.test(sourceRowText) || Number(sourceRowText) < 2) {
      return { ok: false, error: `Correction CSV row ${index + 1} has an invalid source_row.` };
    }

    const sourceRow = Number(sourceRowText);
    if (seenSourceRows.has(sourceRow)) {
      return { ok: false, error: `Source row ${sourceRow} appears more than once in the correction file.` };
    }
    seenSourceRows.add(sourceRow);

    const values = Object.fromEntries(
      requiredColumns.map((column) => [column, parsedValues[headers.indexOf(column)] ?? ""]),
    ) as Record<RequiredColumn, string>;
    records.push({ sourceRow, values });
  }

  return { ok: true, records };
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

function percentile(sortedValues: number[], percentileValue: number) {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function revenueGuardrailFor(records: RawSalesRecord[], configuration: EtlConfiguration): RevenueGuardrailResult {
  const revenueValues = records
    .flatMap((record) => {
      const parsed = parseFinancialValue(record.values.revenue);
      return parsed.ok && parsed.value >= 0 ? [parsed.value] : [];
    })
    .sort((left, right) => left - right);
  const medianRevenue = percentile(revenueValues, 0.5);
  const firstQuartile = percentile(revenueValues, 0.25);
  const thirdQuartile = percentile(revenueValues, 0.75);
  const statisticalLimit = configuration.statisticalOutliersEnabled
    && revenueValues.length >= configuration.statisticalMinimumRows
    && medianRevenue !== null
    && firstQuartile !== null
    && thirdQuartile !== null
      ? Math.max(
          medianRevenue * configuration.medianMultiplier,
          thirdQuartile + configuration.iqrMultiplier * (thirdQuartile - firstQuartile),
        )
      : null;

  return {
    maxRevenuePerOrder: configuration.maxRevenuePerOrder,
    statisticalOutliersEnabled: configuration.statisticalOutliersEnabled,
    statisticalSampleSize: revenueValues.length,
    medianRevenue,
    statisticalLimit,
    approvedExceptions: configuration.approvedRevenueOutlierRows.length,
  };
}

function displayRevenue(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
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

export function runEtl(
  records: RawSalesRecord[],
  configuration: Partial<EtlConfiguration> = {},
): EtlResult {
  const resolvedConfiguration: EtlConfiguration = {
    ...defaultEtlConfiguration,
    ...configuration,
    approvedRevenueOutlierRows: configuration.approvedRevenueOutlierRows
      ?? defaultEtlConfiguration.approvedRevenueOutlierRows,
  };
  const revenueGuardrail = revenueGuardrailFor(records, resolvedConfiguration);
  const approvedRevenueOutliers = new Set(resolvedConfiguration.approvedRevenueOutlierRows);
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

    if (revenue.ok && revenue.value >= 0 && !approvedRevenueOutliers.has(row)) {
      const exceedsConfiguredMaximum = revenue.value > resolvedConfiguration.maxRevenuePerOrder;
      const exceedsStatisticalLimit = revenueGuardrail.statisticalLimit !== null
        && revenue.value > revenueGuardrail.statisticalLimit;
      if (exceedsConfiguredMaximum || exceedsStatisticalLimit) {
        const reason = exceedsConfiguredMaximum
          ? `Revenue outlier: ${displayRevenue(revenue.value)} exceeds configured maximum of ${displayRevenue(resolvedConfiguration.maxRevenuePerOrder)}`
          : `Revenue outlier: ${displayRevenue(revenue.value)} exceeds adaptive limit of ${displayRevenue(revenueGuardrail.statisticalLimit ?? 0)}`;
        issues.push({ row, field: "revenue", message: reason, severity: "error", action: "quarantined" });
        quarantined.add(row);
      }
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
    revenueGuardrail,
  };
}

export function validateManualCorrection(
  records: RawSalesRecord[],
  currentResult: EtlResult,
  sourceRow: number,
  values: Record<RequiredColumn, string>,
  configuration: Partial<EtlConfiguration> = {},
): ManualCorrectionResult {
  const sourceRecord = records.find((record) => record.sourceRow === sourceRow);
  if (!sourceRecord) {
    return {
      ok: false,
      message: `Source row ${sourceRow} is no longer available for review.`,
      problems: [],
    };
  }

  const changes = requiredColumns
    .filter((field) => sourceRecord.values[field] !== values[field])
    .map((field) => ({
      field,
      before: sourceRecord.values[field],
      after: values[field],
    }));

  if (!changes.length) {
    return {
      ok: false,
      message: "Enter at least one verified correction before revalidating this record.",
      problems: currentResult.quarantinedRecords.find((record) => record.sourceRow === sourceRow)?.problems ?? [],
    };
  }

  const updatedRecords = records.map((record) => (
    record.sourceRow === sourceRow
      ? { ...record, values: { ...values } }
      : record
  ));
  const nextResult = runEtl(updatedRecords, configuration);
  const remainingQuarantine = nextResult.quarantinedRecords.find((record) => record.sourceRow === sourceRow);

  if (remainingQuarantine) {
    return {
      ok: false,
      message: "This record still fails the data contract. Review the remaining issues and try again.",
      problems: remainingQuarantine.problems,
    };
  }

  const trustedRowsAdded = nextResult.rows.length - currentResult.rows.length;
  if (trustedRowsAdded < 1) {
    return {
      ok: false,
      message: "The corrected values match an existing order, so this row would be removed as a duplicate instead of published. Verify the order ID and values.",
      problems: [{
        field: "order_id",
        value: values.order_id.trim() || "(blank)",
        message: "Correction does not create a new trusted record",
      }],
    };
  }

  return {
    ok: true,
    records: updatedRecords,
    result: nextResult,
    changes,
    trustedRowsAdded,
  };
}

export function previewBatchCorrections(
  records: RawSalesRecord[],
  currentResult: EtlResult,
  corrections: BatchCorrectionRecord[],
  configuration: Partial<EtlConfiguration> = {},
): BatchCorrectionPreviewResult {
  if (!corrections.length) {
    return { ok: false, error: "The correction file does not contain any records." };
  }

  const currentQuarantine = new Set(currentResult.quarantinedRecords.map((record) => record.sourceRow));
  const unknownRows = corrections
    .map((record) => record.sourceRow)
    .filter((sourceRow) => !currentQuarantine.has(sourceRow));
  if (unknownRows.length) {
    return {
      ok: false,
      error: `These source rows are not in the current quarantine queue: ${unknownRows.slice(0, 5).join(", ")}${unknownRows.length > 5 ? "…" : ""}`,
    };
  }

  const correctionBySourceRow = new Map(corrections.map((record) => [record.sourceRow, record]));
  const changesBySourceRow = new Map<number, ManualFieldChange[]>();
  const updatedRecords = records.map((record) => {
    const correction = correctionBySourceRow.get(record.sourceRow);
    if (!correction) return record;

    const changes = requiredColumns
      .filter((field) => record.values[field] !== correction.values[field])
      .map((field) => ({
        field,
        before: record.values[field],
        after: correction.values[field],
      }));
    changesBySourceRow.set(record.sourceRow, changes);
    return changes.length ? { ...record, values: { ...correction.values } } : record;
  });

  const changedRows = [...changesBySourceRow.values()].filter((changes) => changes.length).length;
  if (!changedRows) {
    return { ok: false, error: "No verified values changed. Edit at least one quarantined record before uploading the file." };
  }

  const nextResult = runEtl(updatedRecords, configuration);
  const remainingQuarantine = new Set(nextResult.quarantinedRecords.map((record) => record.sourceRow));
  const removedDuplicates = new Set(
    nextResult.issues
      .filter((issue) => issue.action === "removed")
      .map((issue) => issue.row),
  );
  const outcomes: BatchCorrectionOutcome[] = corrections.map((correction) => ({
    sourceRow: correction.sourceRow,
    orderId: correction.values.order_id.trim() || "Missing order ID",
    changes: changesBySourceRow.get(correction.sourceRow) ?? [],
    outcome: remainingQuarantine.has(correction.sourceRow)
      ? "quarantined"
      : removedDuplicates.has(correction.sourceRow)
        ? "duplicate"
        : "published",
  }));

  return {
    ok: true,
    preview: {
      records: updatedRecords,
      result: nextResult,
      outcomes,
      submittedRows: corrections.length,
      changedRows,
      publishableRows: outcomes.filter((record) => record.outcome === "published").length,
      remainingRows: outcomes.filter((record) => record.outcome === "quarantined").length,
      duplicateRows: outcomes.filter((record) => record.outcome === "duplicate").length,
      trustedRowsAdded: nextResult.rows.length - currentResult.rows.length,
    },
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

export function createQuarantineCsv(records: RawSalesRecord[], quarantinedRecords: QuarantinedRecord[]) {
  const recordBySourceRow = new Map(records.map((record) => [record.sourceRow, record]));
  const headers = ["source_row", ...requiredColumns, "issue_fields", "issue_reasons"];
  const lines = quarantinedRecords.flatMap((quarantinedRecord) => {
    const sourceRecord = recordBySourceRow.get(quarantinedRecord.sourceRow);
    if (!sourceRecord) return [];

    return [[
      quarantinedRecord.sourceRow,
      ...requiredColumns.map((column) => sourceRecord.values[column]),
      quarantinedRecord.problems.map((problem) => problem.field).join(" | "),
      quarantinedRecord.problems.map((problem) => problem.message).join(" | "),
    ].map(csvValue).join(",")];
  });

  return [headers.join(","), ...lines].join("\n");
}
