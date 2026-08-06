"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  createQuarantineCsv,
  createSalesCsv,
  extractBatchCorrectionCsv,
  extractCsv,
  previewBatchCorrections,
  recordsFromSalesRows,
  requiredColumns,
  runEtl,
  validateManualCorrection,
} from "./etl";
import type {
  BatchCorrectionPreview,
  EtlResult,
  ManualFieldChange,
  QuarantinedProblem,
  RawSalesRecord,
  RequiredColumn,
  SalesRow,
} from "./etl";
import type { AnalystResponse, QueryColumn, QueryValue } from "./sql-analyst";

const demoRows: SalesRow[] = [
  { order_id: "ORD-1001", date: "2026-07-21", region: "South", category: "Beverages", revenue: 18450, cost: 11260, status: "Delivered" },
  { order_id: "ORD-1002", date: "2026-07-21", region: "Northeast", category: "Snacks", revenue: 14320, cost: 9380, status: "Delivered" },
  { order_id: "ORD-1003", date: "2026-07-22", region: "Midwest", category: "Household", revenue: 16780, cost: 11840, status: "Late" },
  { order_id: "ORD-1004", date: "2026-07-22", region: "West", category: "Beverages", revenue: 21870, cost: 13120, status: "Delivered" },
  { order_id: "ORD-1005", date: "2026-07-23", region: "South", category: "Personal Care", revenue: 11980, cost: 7020, status: "Delivered" },
  { order_id: "ORD-1006", date: "2026-07-23", region: "Northeast", category: "Household", revenue: 19240, cost: 13750, status: "Delivered" },
  { order_id: "ORD-1007", date: "2026-07-24", region: "Midwest", category: "Snacks", revenue: 12470, cost: 8140, status: "Delivered" },
  { order_id: "ORD-1008", date: "2026-07-24", region: "West", category: "Personal Care", revenue: 17660, cost: 10010, status: "Late" },
  { order_id: "ORD-1009", date: "2026-07-25", region: "South", category: "Household", revenue: 20540, cost: 14280, status: "Delivered" },
  { order_id: "ORD-1010", date: "2026-07-25", region: "Northeast", category: "Beverages", revenue: 15690, cost: 9570, status: "Delivered" },
  { order_id: "ORD-1011", date: "2026-07-26", region: "Midwest", category: "Personal Care", revenue: 13980, cost: 7890, status: "Delivered" },
  { order_id: "ORD-1012", date: "2026-07-26", region: "West", category: "Snacks", revenue: 23150, cost: 14760, status: "Delivered" },
  { order_id: "ORD-1013", date: "2026-07-27", region: "South", category: "Snacks", revenue: 17120, cost: 10980, status: "Late" },
  { order_id: "ORD-1014", date: "2026-07-27", region: "Northeast", category: "Personal Care", revenue: 12630, cost: 7220, status: "Delivered" },
  { order_id: "ORD-1015", date: "2026-07-28", region: "Midwest", category: "Beverages", revenue: 18890, cost: 11540, status: "Delivered" },
  { order_id: "ORD-1016", date: "2026-07-28", region: "West", category: "Household", revenue: 24780, cost: 16910, status: "Delivered" },
  { order_id: "ORD-1017", date: "2026-07-29", region: "South", category: "Personal Care", revenue: 15320, cost: 8680, status: "Delivered" },
  { order_id: "ORD-1018", date: "2026-07-29", region: "Northeast", category: "Snacks", revenue: 16480, cost: 10440, status: "Late" },
  { order_id: "ORD-1019", date: "2026-07-30", region: "Midwest", category: "Household", revenue: 19710, cost: 13420, status: "Delivered" },
  { order_id: "ORD-1020", date: "2026-07-30", region: "West", category: "Beverages", revenue: 22640, cost: 13680, status: "Delivered" },
];

const demoRecords = recordsFromSalesRows(demoRows);
const demoResult = runEtl(demoRecords);

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type ManualAuditEntry = {
  id: string;
  sourceRow: number;
  orderId: string;
  publishedAt: string;
  changes: ManualFieldChange[];
  trustedRowsAdded: number;
};

type BatchAuditEntry = {
  id: string;
  filename: string;
  publishedAt: string;
  submittedRows: number;
  changedRows: number;
  publishableRows: number;
  remainingRows: number;
  trustedRowsAdded: number;
};

type QuarantineFilter = "all" | "missing" | "date" | "financial" | "duplicate" | "other";

const quarantinePageSize = 15;

const fieldLabels: Record<RequiredColumn, string> = {
  order_id: "Order ID",
  date: "Date",
  region: "Region",
  category: "Category",
  revenue: "Revenue",
  cost: "Cost",
  status: "Status",
};

function problemAppliesToField(problem: QuarantinedProblem, field: RequiredColumn) {
  return problem.field === field
    || (problem.field === "revenue / cost" && (field === "revenue" || field === "cost"));
}

function problemCategory(problem: QuarantinedProblem): Exclude<QuarantineFilter, "all"> {
  const text = `${problem.field} ${problem.message}`.toLowerCase();
  if (text.includes("missing")) return "missing";
  if (text.includes("date") || problem.field === "date") return "date";
  if (text.includes("revenue") || text.includes("cost") || text.includes("financial") || text.includes("numeric")) return "financial";
  if (text.includes("duplicate") || problem.field === "order_id") return "duplicate";
  return "other";
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [rawRecords, setRawRecords] = useState<RawSalesRecord[]>(demoRecords);
  const [rows, setRows] = useState<SalesRow[]>(demoResult.rows);
  const [etlResult, setEtlResult] = useState<EtlResult | null>(demoResult);
  const [sourceName, setSourceName] = useState("retail_sales_demo.csv");
  const [rawRowCount, setRawRowCount] = useState(demoRecords.length);
  const [pipelineStatus, setPipelineStatus] = useState<"ready" | "running" | "complete">("complete");
  const [lastRun, setLastRun] = useState("Demo pipeline • ready to explore");
  const [uploadError, setUploadError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(
    "West is the current revenue leader. Ask me about regions, margins, late orders, or data quality.",
  );
  const [queryTrace, setQueryTrace] = useState<AnalystResponse | null>(null);
  const [selectedSourceRow, setSelectedSourceRow] = useState<number | null>(null);
  const [remediationDraft, setRemediationDraft] = useState<Record<RequiredColumn, string> | null>(null);
  const [remediationError, setRemediationError] = useState("");
  const [remediationProblems, setRemediationProblems] = useState<QuarantinedProblem[]>([]);
  const [remediationStatus, setRemediationStatus] = useState("");
  const [remediationAudit, setRemediationAudit] = useState<ManualAuditEntry[]>([]);
  const [batchAudit, setBatchAudit] = useState<BatchAuditEntry[]>([]);
  const [quarantineSearch, setQuarantineSearch] = useState("");
  const [quarantineFilter, setQuarantineFilter] = useState<QuarantineFilter>("all");
  const [quarantinePage, setQuarantinePage] = useState(0);
  const [batchPreview, setBatchPreview] = useState<BatchCorrectionPreview | null>(null);
  const [batchFilename, setBatchFilename] = useState("");
  const [batchError, setBatchError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const batchFileRef = useRef<HTMLInputElement>(null);
  const remediationEditorRef = useRef<HTMLFormElement>(null);

  const issues = etlResult?.issues ?? [];
  const corrections = etlResult?.corrections ?? [];
  const quarantinedRecords = useMemo(() => etlResult?.quarantinedRecords ?? [], [etlResult]);
  const trustedCount = etlResult?.rows.length ?? 0;
  const quarantinedCount = etlResult?.quarantinedRows ?? 0;
  const sourceQuality = etlResult?.sourceQualityScore ?? 0;
  const publishedQuality = etlResult?.publishedQualityScore ?? 0;
  const selectedQuarantine = selectedSourceRow === null
    ? null
    : quarantinedRecords.find((record) => record.sourceRow === selectedSourceRow) ?? null;
  const selectedRawRecord = selectedSourceRow === null
    ? null
    : rawRecords.find((record) => record.sourceRow === selectedSourceRow) ?? null;
  const filteredQuarantinedRecords = useMemo(() => {
    const normalizedSearch = quarantineSearch.trim().toLowerCase();
    return quarantinedRecords.filter((record) => {
      const matchesFilter = quarantineFilter === "all"
        || record.problems.some((problem) => problemCategory(problem) === quarantineFilter);
      const searchableText = [
        record.orderId,
        String(record.sourceRow),
        ...record.problems.flatMap((problem) => [problem.field, problem.value, problem.message]),
      ].join(" ").toLowerCase();
      return matchesFilter && (!normalizedSearch || searchableText.includes(normalizedSearch));
    });
  }, [quarantineFilter, quarantineSearch, quarantinedRecords]);
  const quarantinePageCount = Math.max(1, Math.ceil(filteredQuarantinedRecords.length / quarantinePageSize));
  const activeQuarantinePage = Math.min(quarantinePage, quarantinePageCount - 1);
  const quarantinePageStart = activeQuarantinePage * quarantinePageSize;
  const visibleQuarantinedRecords = filteredQuarantinedRecords.slice(
    quarantinePageStart,
    quarantinePageStart + quarantinePageSize,
  );

  useEffect(() => {
    if (selectedSourceRow === null) return;
    window.requestAnimationFrame(() => {
      remediationEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      remediationEditorRef.current?.focus({ preventScroll: true });
    });
  }, [selectedSourceRow]);

  const analytics = useMemo(() => {
    const revenue = rows.reduce((total, row) => total + row.revenue, 0);
    const cost = rows.reduce((total, row) => total + row.cost, 0);
    const lateOrders = rows.filter((row) => row.status.toLowerCase() === "late").length;

    const byRegion = Object.entries(
      rows.reduce<Record<string, number>>((totals, row) => {
        totals[row.region] = (totals[row.region] ?? 0) + row.revenue;
        return totals;
      }, {}),
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const byCategory = Object.entries(
      rows.reduce<Record<string, { revenue: number; cost: number; orders: number }>>((totals, row) => {
        totals[row.category] ??= { revenue: 0, cost: 0, orders: 0 };
        totals[row.category].revenue += row.revenue;
        totals[row.category].cost += row.cost;
        totals[row.category].orders += 1;
        return totals;
      }, {}),
    )
      .map(([name, value]) => ({
        name,
        ...value,
        margin: value.revenue ? ((value.revenue - value.cost) / value.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.margin - a.margin);

    return {
      revenue,
      cost,
      grossMargin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
      lateOrders,
      onTimeRate: rows.length ? ((rows.length - lateOrders) / rows.length) * 100 : 0,
      byRegion,
      byCategory,
    };
  }, [rows]);

  const maxRegionRevenue = Math.max(...analytics.byRegion.map((region) => region.value), 1);

  function downloadSample() {
    downloadCsv(createSalesCsv(demoRows), "pulseops_sample_sales.csv");
  }

  function downloadCleaned() {
    if (!rows.length || pipelineStatus !== "complete") return;
    const baseName = sourceName.replace(/\.csv$/i, "");
    downloadCsv(createSalesCsv(rows), `${baseName}_cleaned.csv`);
  }

  function downloadQuarantine() {
    if (!quarantinedRecords.length) return;
    const baseName = sourceName.replace(/\.csv$/i, "");
    downloadCsv(
      createQuarantineCsv(rawRecords, quarantinedRecords),
      `${baseName}_quarantine_corrections.csv`,
    );
  }

  function parseBatchUpload(file: File) {
    if (!etlResult) return;
    const reader = new FileReader();
    reader.onload = () => {
      const extracted = extractBatchCorrectionCsv(String(reader.result ?? ""));
      if (!extracted.ok) {
        setBatchError(extracted.error);
        setBatchPreview(null);
        setBatchFilename(file.name);
        return;
      }

      const preview = previewBatchCorrections(rawRecords, etlResult, extracted.records);
      if (!preview.ok) {
        setBatchError(preview.error);
        setBatchPreview(null);
        setBatchFilename(file.name);
        return;
      }

      setBatchPreview(preview.preview);
      setBatchFilename(file.name);
      setBatchError("");
      setRemediationStatus("");
      closeCorrection();
    };
    reader.onloadend = () => {
      if (batchFileRef.current) batchFileRef.current.value = "";
    };
    reader.readAsText(file);
  }

  function applyBatchCorrections() {
    if (!batchPreview) return;
    const publishedAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const trustedLabel = `${batchPreview.trustedRowsAdded} trusted row${batchPreview.trustedRowsAdded === 1 ? "" : "s"}`;

    setRawRecords(batchPreview.records);
    setRows(batchPreview.result.rows);
    setEtlResult(batchPreview.result);
    setPipelineStatus("complete");
    setLastRun(`Batch republished • ${publishedAt}`);
    setAnswer(
      `The corrected batch added ${trustedLabel}. ${batchPreview.remainingRows} submitted row${batchPreview.remainingRows === 1 ? " still needs" : "s still need"} review. KPIs and SQL answers now use the republished trusted dataset.`,
    );
    setQueryTrace(null);
    setBatchAudit((current) => [{
      id: `batch-${Date.now()}`,
      filename: batchFilename,
      publishedAt,
      submittedRows: batchPreview.submittedRows,
      changedRows: batchPreview.changedRows,
      publishableRows: batchPreview.publishableRows,
      remainingRows: batchPreview.remainingRows,
      trustedRowsAdded: batchPreview.trustedRowsAdded,
    }, ...current]);
    setRemediationStatus(
      `Batch revalidation completed: ${batchPreview.publishableRows} submitted record${batchPreview.publishableRows === 1 ? "" : "s"} published, ${batchPreview.remainingRows} remain quarantined, and ${trustedLabel} added overall.`,
    );
    closeCorrection();
    setBatchPreview(null);
    setBatchFilename("");
    setBatchError("");
    setQuarantinePage(0);
  }

  function parseUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const extracted = extractCsv(String(reader.result ?? ""));
      if ("error" in extracted) {
        setUploadError(extracted.error);
        return;
      }

      setRawRecords(extracted.records);
      setRows([]);
      setEtlResult(null);
      setSourceName(file.name);
      setRawRowCount(extracted.rowCount);
      setUploadError("");
      setPipelineStatus("ready");
      setLastRun("Extracted • ready to validate and transform");
      setAnswer("Your raw file is loaded but has not been cleaned. Run the ETL pipeline before asking about performance.");
      setQueryTrace(null);
      setSelectedSourceRow(null);
      setRemediationDraft(null);
      setRemediationError("");
      setRemediationProblems([]);
      setRemediationStatus("");
      setRemediationAudit([]);
      setBatchAudit([]);
      setQuarantineSearch("");
      setQuarantineFilter("all");
      setQuarantinePage(0);
      setBatchPreview(null);
      setBatchFilename("");
      setBatchError("");
    };
    reader.readAsText(file);
  }

  function runPipeline() {
    if (!rawRecords.length || pipelineStatus === "running") return;
    setPipelineStatus("running");
    setLastRun("Validating and transforming rows…");
    window.setTimeout(() => {
      const result = runEtl(rawRecords);
      setRows(result.rows);
      setEtlResult(result);
      setPipelineStatus("complete");
      setLastRun(`Completed • ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
      setAnswer(
        `The pipeline published ${result.rows.length} trusted rows, corrected ${result.corrections.length} values, removed ${result.duplicatesResolved} exact duplicate${result.duplicatesResolved === 1 ? "" : "s"}, and quarantined ${result.quarantinedRows} risky row${result.quarantinedRows === 1 ? "" : "s"}.`,
      );
      setQueryTrace(null);
      setSelectedSourceRow(null);
      setRemediationDraft(null);
      setRemediationError("");
      setRemediationProblems([]);
      setBatchPreview(null);
      setBatchFilename("");
      setBatchError("");
      setQuarantinePage(0);
    }, 650);
  }

  function openCorrection(sourceRow: number) {
    const quarantine = quarantinedRecords.find((record) => record.sourceRow === sourceRow);
    const sourceRecord = rawRecords.find((record) => record.sourceRow === sourceRow);
    if (!quarantine || !sourceRecord) return;

    setSelectedSourceRow(sourceRow);
    setRemediationDraft({ ...sourceRecord.values });
    setRemediationProblems(quarantine.problems);
    setRemediationError("");
    setRemediationStatus("");
    setBatchPreview(null);
    setBatchFilename("");
    setBatchError("");
  }

  function closeCorrection() {
    setSelectedSourceRow(null);
    setRemediationDraft(null);
    setRemediationProblems([]);
    setRemediationError("");
  }

  function updateCorrection(field: RequiredColumn, value: string) {
    setRemediationDraft((current) => current ? { ...current, [field]: value } : current);
  }

  function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedSourceRow === null || !remediationDraft || !etlResult) return;

    const correction = validateManualCorrection(
      rawRecords,
      etlResult,
      selectedSourceRow,
      remediationDraft,
    );

    if (!correction.ok) {
      setRemediationError(correction.message);
      setRemediationProblems(correction.problems);
      return;
    }

    const publishedAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const publishedOrderId = remediationDraft.order_id.trim() || selectedQuarantine?.orderId || "Unknown order";
    const trustedLabel = `${correction.trustedRowsAdded} trusted row${correction.trustedRowsAdded === 1 ? "" : "s"}`;

    setRawRecords(correction.records);
    setRows(correction.result.rows);
    setEtlResult(correction.result);
    setPipelineStatus("complete");
    setLastRun(`Republished after manual review • ${publishedAt}`);
    setAnswer(
      `${publishedOrderId} passed the full data contract and added ${trustedLabel}. KPIs and analyst queries now use the republished trusted dataset.`,
    );
    setQueryTrace(null);
    setBatchPreview(null);
    setBatchFilename("");
    setBatchError("");
    setRemediationAudit((current) => [{
      id: `${selectedSourceRow}-${Date.now()}`,
      sourceRow: selectedSourceRow,
      orderId: publishedOrderId,
      publishedAt,
      changes: correction.changes,
      trustedRowsAdded: correction.trustedRowsAdded,
    }, ...current]);
    setRemediationStatus(
      `${publishedOrderId} was revalidated and published. ${trustedLabel} added; dashboard KPIs and SQL answers refreshed.`,
    );
    closeCorrection();
  }

  async function answerQuestion(value = question) {
    if (!value.trim()) return;
    if (pipelineStatus !== "complete" || !etlResult) {
      setAnswer("Run the ETL pipeline first so I answer from the cleaned, published dataset—not the raw upload.");
      setQueryTrace(null);
    } else {
      const { runAnalystQuery } = await import("./sql-analyst");
      const response = runAnalystQuery(value, rows, {
        sourceRowCount: rawRowCount,
        quarantinedCount,
        correctionsCount: corrections.length,
        duplicatesResolved: etlResult.duplicatesResolved,
        sourceQuality,
        publishedQuality,
      });
      setAnswer(response.answer);
      setQueryTrace(response);
    }
    setQuestion("");
  }

  function formatQueryValue(value: QueryValue, column: QueryColumn) {
    if (column.format === "currency") return money.format(Number(value));
    if (column.format === "percent") return `${Number(value).toFixed(1)}%`;
    if (column.format === "number") return Number(value).toLocaleString("en-US");
    return String(value);
  }

  const suggestions = [
    "Show the top 2 regions by revenue",
    "What category has the best margin?",
    "Are there data quality issues?",
    "Where should operations focus?",
  ];

  const fileDetail = pipelineStatus === "complete" && etlResult
    ? `${rawRowCount} source rows • ${trustedCount} trusted • ${quarantinedCount} quarantined`
    : `${rawRowCount} source rows • waiting for ETL`;

  const stages = [
    ["01", "Extract", `${rawRowCount} raw rows`],
    ["02", "Validate", etlResult ? `${issues.length} issues detected` : "Waiting for run"],
    ["03", "Transform", etlResult ? `${corrections.length} corrected • ${quarantinedCount} quarantined` : "Safe rules pending"],
    ["04", "Publish", etlResult ? `${trustedCount} trusted rows` : "Not published"],
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div><strong>PulseOps</strong><span>Data operations</span></div>
        </div>
        <nav aria-label="Primary navigation">
          <a className="nav-item active" href="#overview"><span>01</span>Overview</a>
          <a className="nav-item" href="#pipeline"><span>02</span>Pipeline</a>
          <a className="nav-item" href="#analysis"><span>03</span>Analysis</a>
          <a className="nav-item" href="#copilot"><span>04</span>Ask Pulse</a>
        </nav>
        <div className="project-owner">
          <div className="avatar">KM</div>
          <div>
            <strong>Krishna Mvwala</strong>
            <span>Senior Data Analyst</span>
            <span>Data Engineering · Forward-Deployed Analytics</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Forward-deployed analytics workspace</p><h1>Retail performance command center</h1></div>
          <div className="topbar-actions">
            <span className="scenario-badge">Portfolio scenario</span>
            <button className="secondary-button" onClick={downloadSample}>Download sample CSV</button>
          </div>
        </header>

        <div className="content-grid" id="overview">
          <section className="objective-card">
            <div>
              <p className="section-kicker">Customer objective</p>
              <h2>Turn daily sales files into trusted decisions before 8 AM.</h2>
              <p>Unify regional extracts, enforce data contracts, publish executive KPIs, and give operations a fast way to investigate performance.</p>
            </div>
            <div className="objective-meta">
              <span>Success criteria</span><strong>Reliable refresh</strong><strong>Traceable quality</strong><strong>Actionable answers</strong>
            </div>
          </section>

          <section className="ingestion-card" id="pipeline">
            <div className="card-heading">
              <div><p className="section-kicker">Ingestion control</p><h2>Load a customer sales extract</h2></div>
              <span className={`status-pill ${pipelineStatus}`}>{pipelineStatus}</span>
            </div>
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => event.target.files?.[0] && parseUpload(event.target.files[0])}
              aria-label="Upload a CSV sales file"
            />
            <button className="upload-zone" onClick={() => fileRef.current?.click()}>
              <span className="upload-icon">CSV</span>
              <span><strong>Choose a CSV file</strong><small>Required: order ID, date, region, category, revenue, cost, status</small></span>
              <span className="browse-label">Browse</span>
            </button>
            {uploadError && <p className="error-message" role="alert">{uploadError}</p>}
            <div className="file-row">
              <div className="file-name"><span>✓</span><div><strong>{sourceName}</strong><small>{fileDetail}</small></div></div>
              <button className="primary-button" onClick={runPipeline} disabled={pipelineStatus === "running" || !rawRecords.length}>
                {pipelineStatus === "running" ? "Running pipeline…" : "Run ETL pipeline"}
              </button>
            </div>
          </section>

          <section className="pipeline-card">
            <div className="card-heading compact">
              <div><p className="section-kicker">Execution trace</p><h2>Source-to-insight pipeline</h2></div>
              <span className="last-run">{lastRun}</span>
            </div>
            <div className="pipeline-flow">
              {stages.map(([number, label, detail], index) => (
                <div className="pipeline-stage" key={label}>
                  <span className="stage-number">{number}</span>
                  <div><strong>{label}</strong><small>{detail}</small></div>
                  {index < 3 && <span className="stage-arrow">→</span>}
                </div>
              ))}
            </div>
          </section>

          <section className="quality-card">
            <div className="card-heading compact">
              <div><p className="section-kicker">Data contract</p><h2>Before &amp; after quality</h2></div>
              <span className="traceability-badge">Traceable</span>
            </div>
            <div className="quality-comparison">
              <div className="quality-column source-quality">
                <span className="quality-label">Source quality</span>
                <strong>{etlResult ? `${sourceQuality}%` : "—"}</strong>
                <div className="quality-bar"><span style={{ width: `${sourceQuality}%` }} /></div>
                <small>{etlResult ? `${issues.length} validation findings` : "Run the pipeline to measure"}</small>
              </div>
              <div className="quality-divider"><span>→</span></div>
              <div className="quality-column published-quality">
                <span className="quality-label">Published quality</span>
                <strong>{etlResult ? `${publishedQuality}%` : "—"}</strong>
                <div className="quality-bar"><span style={{ width: `${publishedQuality}%` }} /></div>
                <small>{etlResult ? `${trustedCount} rows pass all publish rules` : "Nothing published yet"}</small>
              </div>
            </div>
            <p className="quality-note">Safe formatting problems are corrected. Ambiguous or risky records are quarantined before KPI calculation.</p>
          </section>

          <section className="transformation-card">
            <div className="card-heading compact">
              <div><p className="section-kicker">Transformation summary</p><h2>Safe corrections and exceptions</h2></div>
              <span className={`status-pill ${pipelineStatus}`}>{pipelineStatus === "complete" ? "published" : pipelineStatus}</span>
            </div>
            <div className="transformation-grid">
              <article className="transformation-item corrected">
                <span className="summary-icon">✓</span>
                <div><strong>{corrections.length} values corrected automatically</strong><small>Whitespace, casing, date formats, and numeric formatting</small></div>
              </article>
              <article className="transformation-item duplicate">
                <span className="summary-icon">↻</span>
                <div><strong>{etlResult?.duplicatesResolved ?? 0} exact duplicates resolved</strong><small>Identical order records are removed once and logged</small></div>
              </article>
              <article className="transformation-item quarantined">
                <span className="summary-icon">!</span>
                <div><strong>{quarantinedCount} rows quarantined for review</strong><small>Missing values, invalid dates, negative values, and conflicting IDs</small></div>
              </article>
            </div>
            <div className="resolution-workflow" aria-label="Customer correction workflow">
              <div className="resolution-heading">
                <div>
                  <p className="section-kicker">Customer correction workflow</p>
                  <strong>Turn reviewed exceptions into trusted records</strong>
                </div>
                <span>Human-verified remediation</span>
              </div>
              <ol>
                <li><b>1</b><span><strong>Review</strong><small>Open the quarantined source row and its validation reasons.</small></span></li>
                <li><b>2</b><span><strong>Verify</strong><small>Confirm the intended value with the source system or record owner.</small></span></li>
                <li><b>3</b><span><strong>Revalidate</strong><small>Run the edited record through the complete data contract again.</small></span></li>
                <li><b>4</b><span><strong>Republish</strong><small>Refresh trusted KPIs and SQL answers only after every rule passes.</small></span></li>
              </ol>
            </div>
            <div className="quarantine-panel">
              <div className="quarantine-heading">
                <div>
                  <strong>Quarantined records</strong>
                  <span>Excluded from KPIs, but preserved here with the original value and reason.</span>
                </div>
                <span className="quarantine-count">{quarantinedRecords.length} record{quarantinedRecords.length === 1 ? "" : "s"}</span>
              </div>
              {!etlResult ? (
                <p className="quarantine-empty pending">Run the ETL pipeline to identify records that need review.</p>
              ) : quarantinedRecords.length ? (
                <>
                  <div className="quarantine-controls">
                    <label className="quarantine-search">
                      <span>Search queue</span>
                      <input
                        type="search"
                        value={quarantineSearch}
                        placeholder="Order ID, source row, value, or reason"
                        onChange={(event) => {
                          setQuarantineSearch(event.target.value);
                          setQuarantinePage(0);
                        }}
                      />
                    </label>
                    <label className="quarantine-filter">
                      <span>Issue type</span>
                      <select
                        value={quarantineFilter}
                        onChange={(event) => {
                          setQuarantineFilter(event.target.value as QuarantineFilter);
                          setQuarantinePage(0);
                        }}
                      >
                        <option value="all">All issues</option>
                        <option value="missing">Missing values</option>
                        <option value="date">Invalid dates</option>
                        <option value="financial">Financial values</option>
                        <option value="duplicate">Duplicate IDs</option>
                        <option value="other">Other rules</option>
                      </select>
                    </label>
                    <div className="quarantine-actions">
                      <button type="button" className="queue-secondary-button" onClick={downloadQuarantine}>Download queue CSV</button>
                      <button type="button" className="queue-primary-button" onClick={() => batchFileRef.current?.click()}>Upload corrected CSV</button>
                      <input
                        ref={batchFileRef}
                        className="visually-hidden"
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(event) => event.target.files?.[0] && parseBatchUpload(event.target.files[0])}
                        aria-label="Upload corrected quarantine CSV"
                      />
                    </div>
                  </div>
                  <div className="quarantine-guidance">
                    <span><b>Individual:</b> review unusual exceptions one at a time.</span>
                    <span><b>Batch:</b> download the queue, keep <code>source_row</code> unchanged, edit verified values, and upload it for a preview.</span>
                  </div>
                  {batchError && <p className="batch-error" role="alert"><strong>{batchFilename || "Correction file"}</strong><span>{batchError}</span></p>}
                  {batchPreview && (
                    <div className="batch-preview" aria-live="polite">
                      <div className="batch-preview-heading">
                        <div><p className="section-kicker">Batch validation preview</p><strong>{batchFilename}</strong><span>Nothing is republished until you confirm this preview.</span></div>
                        <button type="button" className="editor-close" onClick={() => { setBatchPreview(null); setBatchFilename(""); }}>×</button>
                      </div>
                      <div className="batch-preview-grid">
                        <div><span>Submitted</span><strong>{batchPreview.submittedRows}</strong><small>{batchPreview.changedRows} rows edited</small></div>
                        <div className="preview-publish"><span>Will publish</span><strong>{batchPreview.publishableRows}</strong><small>Pass every rule</small></div>
                        <div className="preview-review"><span>Still review</span><strong>{batchPreview.remainingRows}</strong><small>Remain quarantined</small></div>
                        <div><span>Trusted change</span><strong>{batchPreview.trustedRowsAdded > 0 ? "+" : ""}{batchPreview.trustedRowsAdded}</strong><small>{batchPreview.duplicateRows} duplicate removals</small></div>
                      </div>
                      <div className="batch-preview-actions">
                        <button type="button" className="secondary-button" onClick={() => { setBatchPreview(null); setBatchFilename(""); }}>Cancel</button>
                        <button type="button" className="publish-correction-button" onClick={applyBatchCorrections}>Apply batch &amp; republish</button>
                      </div>
                    </div>
                  )}
                  <div className="queue-results-meta">
                    <span>
                      {filteredQuarantinedRecords.length
                        ? `Showing ${quarantinePageStart + 1}–${Math.min(quarantinePageStart + quarantinePageSize, filteredQuarantinedRecords.length)} of ${filteredQuarantinedRecords.length}`
                        : "No matching records"}
                    </span>
                    {filteredQuarantinedRecords.length !== quarantinedRecords.length && <small>{quarantinedRecords.length} total quarantined</small>}
                  </div>
                  {filteredQuarantinedRecords.length ? (
                    <>
                      <div className="quarantine-table-wrap">
                        <table className="quarantine-table" aria-label="Quarantined records and validation reasons">
                          <thead>
                            <tr><th>Order ID</th><th>Source row</th><th>Invalid field and value</th><th>Reason</th><th>Action</th></tr>
                          </thead>
                          <tbody>
                            {visibleQuarantinedRecords.map((record) => (
                              <tr key={record.sourceRow} className={record.sourceRow === selectedSourceRow ? "selected-record" : ""}>
                                <td><strong>{record.orderId}</strong></td>
                                <td>{record.sourceRow}</td>
                                <td>
                                  <div className="problem-list">
                                    {record.problems.map((problem, index) => (
                                      <span key={`${problem.field}-${index}`}><b>{problem.field}</b><code>{problem.value}</code></span>
                                    ))}
                                  </div>
                                </td>
                                <td>
                                  <div className="reason-list">
                                    {record.problems.map((problem, index) => <span key={`${problem.message}-${index}`}>{problem.message}</span>)}
                                  </div>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="review-record-button"
                                    onClick={() => openCorrection(record.sourceRow)}
                                    aria-label={`Review and correct ${record.orderId} from source row ${record.sourceRow}`}
                                  >
                                    {record.sourceRow === selectedSourceRow ? "Editing below ↓" : "Review & correct"}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="queue-pagination" aria-label="Quarantine queue pagination">
                        <button type="button" onClick={() => setQuarantinePage(Math.max(0, activeQuarantinePage - 1))} disabled={activeQuarantinePage === 0}>Previous</button>
                        <span>Page {activeQuarantinePage + 1} of {quarantinePageCount}</span>
                        <button type="button" onClick={() => setQuarantinePage(Math.min(quarantinePageCount - 1, activeQuarantinePage + 1))} disabled={activeQuarantinePage >= quarantinePageCount - 1}>Next</button>
                      </div>
                    </>
                  ) : (
                    <p className="quarantine-empty pending">No quarantined records match the current search and filter.</p>
                  )}
                </>
              ) : (
                <p className="quarantine-empty clear"><span>✓</span>No records were quarantined in this pipeline run.</p>
              )}
              {selectedQuarantine && selectedRawRecord && remediationDraft && (
                <form ref={remediationEditorRef} className="remediation-editor" onSubmit={submitCorrection} tabIndex={-1}>
                  <div className="remediation-editor-heading">
                    <div>
                      <p className="section-kicker">Verified correction</p>
                      <strong>{selectedQuarantine.orderId} · source row {selectedQuarantine.sourceRow}</strong>
                      <span>Edit only values confirmed by the source system or record owner.</span>
                    </div>
                    <button type="button" className="editor-close" onClick={closeCorrection} aria-label="Close correction form">×</button>
                  </div>
                  <div className="remediation-safety-note">
                    <b>No values are guessed.</b> Submitting this form reruns required-field checks, type conversion, business validation, duplicate checks, and publication eligibility.
                  </div>
                  <div className="remediation-fields">
                    {requiredColumns.map((field) => {
                      const fieldProblems = remediationProblems.filter((problem) => problemAppliesToField(problem, field));
                      const original = selectedRawRecord.values[field];
                      return (
                        <label className={fieldProblems.length ? "has-problem" : ""} key={field}>
                          <span>{fieldLabels[field]}</span>
                          <input
                            value={remediationDraft[field]}
                            onChange={(event) => updateCorrection(field, event.target.value)}
                            aria-invalid={fieldProblems.length ? "true" : "false"}
                            autoComplete="off"
                          />
                          <small>Original: <code>{original || "(blank)"}</code></small>
                          {fieldProblems.map((problem, index) => (
                            <em key={`${problem.field}-${problem.message}-${index}`}>{problem.message}</em>
                          ))}
                        </label>
                      );
                    })}
                  </div>
                  {remediationError && <p className="remediation-error" role="alert">{remediationError}</p>}
                  <div className="remediation-actions">
                    <button type="button" className="secondary-button" onClick={closeCorrection}>Cancel</button>
                    <button type="submit" className="publish-correction-button">Validate &amp; republish</button>
                  </div>
                </form>
              )}
            </div>
            {remediationStatus && <p className="remediation-status" role="status"><span>✓</span>{remediationStatus}</p>}
            <div className="remediation-audit">
              <div className="remediation-audit-heading">
                <div><strong>Correction audit</strong><span>Verified individual and batch edits accepted during this session.</span></div>
                <span>{remediationAudit.length + batchAudit.length} event{remediationAudit.length + batchAudit.length === 1 ? "" : "s"}</span>
              </div>
              {remediationAudit.length || batchAudit.length ? (
                <div className="remediation-audit-table-wrap">
                  <table>
                    <thead><tr><th>Time</th><th>Record</th><th>Verified changes</th><th>Result</th></tr></thead>
                    <tbody>
                      {batchAudit.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.publishedAt}</td>
                          <td><strong>{entry.filename}</strong><small>Batch correction file</small></td>
                          <td><div className="audit-change-list"><span><b>{entry.changedRows} rows edited</b><code>{entry.submittedRows} submitted</code></span></div></td>
                          <td><span className="audit-result">+{entry.trustedRowsAdded} trusted</span><small>{entry.publishableRows} published · {entry.remainingRows} remain</small></td>
                        </tr>
                      ))}
                      {remediationAudit.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.publishedAt}</td>
                          <td><strong>{entry.orderId}</strong><small>Source row {entry.sourceRow}</small></td>
                          <td>
                            <div className="audit-change-list">
                              {entry.changes.map((change) => (
                                <span key={change.field}><b>{fieldLabels[change.field]}</b><code>{change.before || "(blank)"}</code><i>→</i><code>{change.after || "(blank)"}</code></span>
                              ))}
                            </div>
                          </td>
                          <td><span className="audit-result">+{entry.trustedRowsAdded} trusted</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No individual or batch corrections have been published in this session.</p>
              )}
            </div>
            <div className="transformation-footer">
              <div><strong>Every change is traceable.</strong><span>No missing or risky business values are guessed.</span></div>
              <button className="download-clean-button" onClick={downloadCleaned} disabled={pipelineStatus !== "complete" || !rows.length}>Download cleaned CSV</button>
            </div>
          </section>

          <section className="analytics-card" id="analysis">
            <div className="analytics-heading">
              <div><p className="section-kicker">Decision layer</p><h2>Executive performance</h2></div>
              <span>{etlResult ? `Updated from ${sourceName}` : "Waiting for a published dataset"}</span>
            </div>
            <div className="kpi-grid">
              <article><span>Total revenue</span><strong>{money.format(analytics.revenue)}</strong><small>{rows.length} trusted orders</small></article>
              <article><span>Gross margin</span><strong>{analytics.grossMargin.toFixed(1)}%</strong><small>{money.format(analytics.revenue - analytics.cost)} contribution</small></article>
              <article><span>On-time rate</span><strong>{analytics.onTimeRate.toFixed(1)}%</strong><small>{analytics.lateOrders} late orders</small></article>
              <article><span>Data quality</span><strong>{publishedQuality}%</strong><small>{etlResult ? `${sourceQuality}% before cleaning` : "Run pipeline to publish"}</small></article>
            </div>
            <div className="analysis-split">
              <div className="chart-panel">
                <div className="panel-title"><div><strong>Revenue by region</strong><span>Ranked contribution</span></div><span>USD</span></div>
                <div className="bar-chart">
                  {analytics.byRegion.map((region, index) => (
                    <div className="bar-row" key={region.name}>
                      <span className="rank">0{index + 1}</span><strong>{region.name}</strong>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${(region.value / maxRegionRevenue) * 100}%` }} /></div>
                      <span>{money.format(region.value)}</span>
                    </div>
                  ))}
                  {!analytics.byRegion.length && <p className="empty-state">Run the pipeline to publish regional performance.</p>}
                </div>
              </div>
              <div className="table-panel">
                <div className="panel-title"><div><strong>Category economics</strong><span>Margin performance</span></div></div>
                <div className="data-table" role="table" aria-label="Category margin performance">
                  <div className="table-row table-head" role="row"><span>Category</span><span>Orders</span><span>Margin</span></div>
                  {analytics.byCategory.map((category) => (
                    <div className="table-row" role="row" key={category.name}>
                      <strong>{category.name}</strong><span>{category.orders}</span><span className="margin-chip">{category.margin.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="copilot-card" id="copilot">
            <div className="copilot-intro">
              <div className="pulse-orb">P</div>
              <div><p className="section-kicker">Analyst copilot</p><h2>Ask Pulse about the loaded data</h2><p>Answers are calculated from the current published dataset—not a static dashboard.</p></div>
            </div>
            <div className="answer-area">
              <div className="answer-box"><span>Pulse</span><p>{answer}</p></div>
              {queryTrace && (
                <div className="query-evidence">
                  <div className="query-meta">
                    <span className="trusted-query-badge">Trusted data only</span>
                    <span>{queryTrace.coverage}</span>
                  </div>
                  {queryTrace.rows.length > 0 && (
                    <div className="query-result-wrap">
                      <table className="query-result-table" aria-label={`${queryTrace.template} query results`}>
                        <thead><tr>{queryTrace.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                        <tbody>
                          {queryTrace.rows.map((row, rowIndex) => (
                            <tr key={`${queryTrace.template}-${rowIndex}`}>
                              {queryTrace.columns.map((column) => <td key={column.key}>{formatQueryValue(row[column.key], column)}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <details className="sql-trace">
                    <summary><span>View SQL executed</span><small>{queryTrace.template}</small></summary>
                    <pre><code>{queryTrace.sql}</code></pre>
                    <p><code>trusted_sales</code> is an in-memory table containing only the current published rows.</p>
                  </details>
                </div>
              )}
            </div>
            <div className="suggestion-row">
              {suggestions.map((suggestion) => <button key={suggestion} onClick={() => answerQuestion(suggestion)}>{suggestion}</button>)}
            </div>
            <div className="question-box">
              <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && answerQuestion()} placeholder="Ask a question about this dataset…" aria-label="Question for the analyst copilot" />
              <button onClick={() => answerQuestion()} aria-label="Submit question">Ask</button>
            </div>
          </section>

          <footer><span>Designed and built by <strong>Krishna Mvwala</strong></span><span>Portfolio scenario • No client data used</span></footer>
        </div>
      </section>
    </main>
  );
}
