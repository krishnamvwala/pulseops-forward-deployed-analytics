"use client";

import { useMemo, useRef, useState } from "react";

type SalesRow = {
  order_id: string;
  date: string;
  region: string;
  category: string;
  revenue: number;
  cost: number;
  status: string;
};

type DataIssue = {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
};

const requiredColumns = [
  "order_id",
  "date",
  "region",
  "category",
  "revenue",
  "cost",
  "status",
];

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

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current.trim());
  return values;
}

function createSampleCsv() {
  const header = requiredColumns.join(",");
  const lines = demoRows.map((row) =>
    [row.order_id, row.date, row.region, row.category, row.revenue, row.cost, row.status].join(","),
  );
  return [header, ...lines].join("\n");
}

export default function Home() {
  const [rows, setRows] = useState<SalesRow[]>(demoRows);
  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [sourceName, setSourceName] = useState("retail_sales_demo.csv");
  const [rawRowCount, setRawRowCount] = useState(demoRows.length);
  const [pipelineStatus, setPipelineStatus] = useState<"ready" | "running" | "complete">("complete");
  const [lastRun, setLastRun] = useState("Demo pipeline • 6:42 AM");
  const [uploadError, setUploadError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(
    "West is the current revenue leader. Ask me about regions, margins, late orders, or data quality.",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const analytics = useMemo(() => {
    const revenue = rows.reduce((total, row) => total + row.revenue, 0);
    const cost = rows.reduce((total, row) => total + row.cost, 0);
    const lateOrders = rows.filter((row) => row.status.toLowerCase() === "late").length;
    const uniqueIds = new Set(rows.map((row) => row.order_id));
    const duplicateCount = rows.length - uniqueIds.size;
    const qualityScore = Math.max(0, 100 - issues.filter((issue) => issue.severity === "error").length * 8 - issues.filter((issue) => issue.severity === "warning").length * 3 - duplicateCount * 5);

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
      duplicateCount,
      qualityScore,
      byRegion,
      byCategory,
    };
  }, [rows, issues]);

  const maxRegionRevenue = Math.max(...analytics.byRegion.map((region) => region.value), 1);

  function downloadSample() {
    const blob = new Blob([createSampleCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pulseops_sample_sales.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function parseUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "").replace(/\r/g, "").trim();
      const lines = content.split("\n").filter(Boolean);
      if (lines.length < 2) {
        setUploadError("The file needs a header and at least one data row.");
        return;
      }

      const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
      const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
      if (missingColumns.length) {
        setUploadError(`Missing required columns: ${missingColumns.join(", ")}`);
        return;
      }

      const nextRows: SalesRow[] = [];
      const nextIssues: DataIssue[] = [];
      const seenIds = new Set<string>();

      lines.slice(1).forEach((line, rowIndex) => {
        const values = parseCsvLine(line);
        const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
        const displayRow = rowIndex + 2;
        const revenue = Number(record.revenue);
        const cost = Number(record.cost);
        let hasError = false;

        for (const field of ["order_id", "date", "region", "category", "status"]) {
          if (!record[field]) {
            nextIssues.push({ row: displayRow, field, message: "Required value is missing", severity: "error" });
            hasError = true;
          }
        }
        if (!Number.isFinite(revenue) || !Number.isFinite(cost)) {
          nextIssues.push({ row: displayRow, field: "revenue / cost", message: "Expected numeric values", severity: "error" });
          hasError = true;
        } else if (revenue < 0 || cost < 0) {
          nextIssues.push({ row: displayRow, field: "revenue / cost", message: "Negative financial value", severity: "error" });
          hasError = true;
        } else if (cost > revenue) {
          nextIssues.push({ row: displayRow, field: "cost", message: "Cost exceeds revenue", severity: "warning" });
        }
        if (record.date && Number.isNaN(Date.parse(record.date))) {
          nextIssues.push({ row: displayRow, field: "date", message: "Invalid date format", severity: "error" });
          hasError = true;
        }
        if (record.order_id && seenIds.has(record.order_id)) {
          nextIssues.push({ row: displayRow, field: "order_id", message: "Duplicate order ID", severity: "warning" });
        }
        seenIds.add(record.order_id);

        if (!hasError) {
          nextRows.push({
            order_id: record.order_id,
            date: record.date,
            region: record.region,
            category: record.category,
            revenue,
            cost,
            status: record.status,
          });
        }
      });

      if (!nextRows.length) {
        setUploadError("No valid rows remained after validation. Review the required format and try again.");
        setIssues(nextIssues);
        return;
      }

      setRows(nextRows);
      setIssues(nextIssues);
      setSourceName(file.name);
      setRawRowCount(lines.length - 1);
      setUploadError("");
      setPipelineStatus("ready");
      setLastRun("File validated • ready to transform");
      setAnswer("Your file is loaded. Run the pipeline, then ask me about its performance or quality.");
    };
    reader.readAsText(file);
  }

  function runPipeline() {
    setPipelineStatus("running");
    setLastRun("Validating and transforming rows…");
    window.setTimeout(() => {
      setPipelineStatus("complete");
      setLastRun(`Completed • ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
    }, 850);
  }

  function answerQuestion(value = question) {
    const normalized = value.toLowerCase();
    const bestRegion = analytics.byRegion[0];
    const bestCategory = analytics.byCategory[0];

    if (!value.trim()) return;
    if (normalized.includes("region") || normalized.includes("revenue")) {
      setAnswer(`${bestRegion?.name ?? "No region"} leads revenue at ${money.format(bestRegion?.value ?? 0)}. It contributes ${analytics.revenue ? (((bestRegion?.value ?? 0) / analytics.revenue) * 100).toFixed(1) : 0}% of total revenue.`);
    } else if (normalized.includes("margin") || normalized.includes("category")) {
      setAnswer(`${bestCategory?.name ?? "No category"} has the strongest gross margin at ${bestCategory?.margin.toFixed(1) ?? 0}%. I would validate whether that advantage is driven by pricing, product mix, or lower fulfillment cost.`);
    } else if (normalized.includes("quality") || normalized.includes("issue") || normalized.includes("trust")) {
      setAnswer(`The current quality score is ${analytics.qualityScore}%. Validation found ${issues.length} issue${issues.length === 1 ? "" : "s"} across ${rawRowCount} source rows, with ${rows.length} rows available for analysis.`);
    } else if (normalized.includes("late") || normalized.includes("operation") || normalized.includes("focus")) {
      setAnswer(`${analytics.lateOrders} orders are late, producing an on-time rate of ${analytics.onTimeRate.toFixed(1)}%. I would start by comparing late orders by region and category, then inspect upstream fulfillment timestamps.`);
    } else {
      setAnswer(`This dataset contains ${rows.length} valid orders and ${money.format(analytics.revenue)} in revenue at a ${analytics.grossMargin.toFixed(1)}% gross margin. Try asking about the top region, best category, late orders, or data quality.`);
    }
    setQuestion("");
  }

  const suggestions = [
    "Which region leads revenue?",
    "What category has the best margin?",
    "Are there data quality issues?",
    "Where should operations focus?",
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <strong>PulseOps</strong>
            <span>Data operations</span>
          </div>
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
            <span>FDE portfolio project</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Forward-deployed analytics workspace</p>
            <h1>Retail performance command center</h1>
          </div>
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
              <span>Success criteria</span>
              <strong>Reliable refresh</strong>
              <strong>Traceable quality</strong>
              <strong>Actionable answers</strong>
            </div>
          </section>

          <section className="ingestion-card" id="pipeline">
            <div className="card-heading">
              <div>
                <p className="section-kicker">Ingestion control</p>
                <h2>Load a customer sales extract</h2>
              </div>
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
              <div className="file-name"><span>✓</span><div><strong>{sourceName}</strong><small>{rawRowCount} source rows • {rows.length} valid rows</small></div></div>
              <button className="primary-button" onClick={runPipeline} disabled={pipelineStatus === "running"}>
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
              {[
                ["01", "Extract", sourceName],
                ["02", "Validate", `${rawRowCount} rows checked`],
                ["03", "Transform", "Types + business rules"],
                ["04", "Publish", `${rows.length} trusted rows`],
              ].map(([number, label, detail], index) => (
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
              <div><p className="section-kicker">Data contract</p><h2>Quality checks</h2></div>
              <strong className="quality-score">{analytics.qualityScore}%</strong>
            </div>
            <div className="check-list">
              {[
                ["Schema", "7 required columns", true],
                ["Completeness", `${issues.filter((issue) => issue.message.includes("missing")).length} missing values`, !issues.some((issue) => issue.message.includes("missing"))],
                ["Uniqueness", `${analytics.duplicateCount} duplicate IDs`, analytics.duplicateCount === 0],
                ["Business rules", `${issues.length} issues logged`, issues.length === 0],
              ].map(([label, detail, passed]) => (
                <div className="check-item" key={String(label)}>
                  <span className={passed ? "check-pass" : "check-warn"}>{passed ? "✓" : "!"}</span>
                  <div><strong>{label}</strong><small>{detail}</small></div>
                </div>
              ))}
            </div>
            <p className="quality-note">Invalid rows are quarantined before KPI calculation. Warnings remain visible for investigation.</p>
          </section>

          <section className="analytics-card" id="analysis">
            <div className="analytics-heading">
              <div><p className="section-kicker">Decision layer</p><h2>Executive performance</h2></div>
              <span>Updated from {sourceName}</span>
            </div>
            <div className="kpi-grid">
              <article><span>Total revenue</span><strong>{money.format(analytics.revenue)}</strong><small>{rows.length} valid orders</small></article>
              <article><span>Gross margin</span><strong>{analytics.grossMargin.toFixed(1)}%</strong><small>{money.format(analytics.revenue - analytics.cost)} contribution</small></article>
              <article><span>On-time rate</span><strong>{analytics.onTimeRate.toFixed(1)}%</strong><small>{analytics.lateOrders} late orders</small></article>
              <article><span>Data quality</span><strong>{analytics.qualityScore}%</strong><small>{issues.length ? `${issues.length} issues to review` : "All checks passed"}</small></article>
            </div>

            <div className="analysis-split">
              <div className="chart-panel">
                <div className="panel-title"><div><strong>Revenue by region</strong><span>Ranked contribution</span></div><span>USD</span></div>
                <div className="bar-chart">
                  {analytics.byRegion.map((region, index) => (
                    <div className="bar-row" key={region.name}>
                      <span className="rank">0{index + 1}</span>
                      <strong>{region.name}</strong>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${(region.value / maxRegionRevenue) * 100}%` }} /></div>
                      <span>{money.format(region.value)}</span>
                    </div>
                  ))}
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
              <div><p className="section-kicker">Analyst copilot</p><h2>Ask Pulse about the loaded data</h2><p>Answers are calculated from the current validated dataset—not a static dashboard.</p></div>
            </div>
            <div className="answer-box"><span>Pulse</span><p>{answer}</p></div>
            <div className="suggestion-row">
              {suggestions.map((suggestion) => <button key={suggestion} onClick={() => answerQuestion(suggestion)}>{suggestion}</button>)}
            </div>
            <div className="question-box">
              <input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && answerQuestion()} placeholder="Ask a question about this dataset…" aria-label="Question for the analyst copilot" />
              <button onClick={() => answerQuestion()} aria-label="Submit question">Ask</button>
            </div>
          </section>

          <footer>
            <span>Designed and built by <strong>Krishna Mvwala</strong></span>
            <span>Portfolio scenario • No client data used</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
