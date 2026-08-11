# PulseOps — Forward-Deployed Analytics

PulseOps is an interactive portfolio project that demonstrates how a Forward-Deployed Engineer can take a loosely defined customer problem and turn it into a usable data product.

The application accepts retail sales data, runs a staged ETL workflow, safely corrects common formatting problems, quarantines risky records, applies a configurable revenue-outlier contract, supports human-verified correction and revalidation, calculates business KPIs from trusted rows, and provides a governed analyst copilot for investigating the published dataset. The copilot works locally with approved SQL templates and can connect to the separate [PulseOps AI Agent](https://github.com/krishnamvwala/pulseops-ai-agent), where Microsoft Foundry selects from read-only, audited tools.

![PulseOps social preview](public/og.png)

## Live Demo

**[Open PulseOps](https://pulseops-krishna-mvwala.krishna-mvwala.workers.dev)**

The hosted application is a public portfolio deployment. The repository contains no client or employer data.

## What the Transform Stage Means

In PulseOps, the transform stage performs safe type conversion and normalization, then separates trusted records from records that require review. It intentionally quarantines values that cannot be corrected without inventing information.

Transform does not always mean automatically “fix everything.” For example:

- A missing revenue value cannot be safely guessed.
- A negative number could be an input error or a legitimate refund, so the pipeline should not reinterpret it without business context.
- An unusually large revenue value could be a typing error or a legitimate enterprise order, so the pipeline isolates it before it can distort KPIs.
- Two records with the same order ID may contain conflicting information.
- An impossible date cannot be corrected without knowing the intended date.

This approach protects the reliability of the published dataset: deterministic formatting problems are corrected, while ambiguous business values remain visible for investigation instead of being silently changed.

### How quarantined records become trusted

Quarantine is a review queue, not a dead end. A customer can open **Review & correct** for a quarantined row, confirm the intended value with the source system or record owner, enter the verified correction, and select **Validate & republish**. PulseOps reruns the complete ETL contract—including type, date, financial, and duplicate checks—before allowing that row into the trusted dataset.

If any problem remains, the record stays quarantined and the interface explains why. If it passes, PulseOps immediately refreshes the trusted-row count, data-quality comparison, KPIs, downloadable cleaned CSV, and SQL-backed analyst answers. A session audit records the source row, time, and before/after values for every accepted manual correction. A revenue outlier can also be approved unchanged as a legitimate exception, but only with a source-verified reason; the approval and publication outcome are audited separately.

For larger exception queues, PulseOps renders 15 records per page inside a scrollable table, with order/source search and issue-type filters. Customers do not need to open hundreds of records individually: they can download the complete quarantine queue as a correction CSV, update only source-verified values, upload it again, review a publish-versus-still-quarantined preview, and republish all passing rows together.

## What the Project Does

PulseOps models a common customer engagement: regional teams send daily CSV extracts, but business leaders need one reliable view of revenue, margin, delivery performance, and data quality.

The application provides an end-to-end workflow:

1. **Extract** — Load a CSV sales file or use the included demonstration dataset.
2. **Validate** — Check required columns, missing values, data types, duplicate IDs, dates, and financial business rules without changing the raw upload.
3. **Transform** — Normalize safe formatting differences, remove exact duplicates, and quarantine values that would require guessing.
4. **Review** — Let the customer enter source-verified corrections; rerun the full data contract and retain a before/after audit trail.
5. **Publish** — Recalculate KPIs and regional/category views from trusted rows only, with a downloadable cleaned CSV.
6. **Investigate** — Ask the analyst copilot questions about revenue, margin, late orders, and quality. In standalone mode the app maps supported questions to approved SQL templates. When the PulseOps AI Agent is configured, it imports the current pipeline with source-row lineage and returns a Foundry-selected governed tool result with evidence.

```mermaid
flowchart LR
    A[Customer CSV] --> B[Schema validation]
    B --> C[Type and business-rule checks]
    C --> D{Valid row?}
    D -->|Yes| E[Trusted analytical dataset]
    D -->|No| F[Quarantine and issue log]
    F --> I[Customer verifies correction]
    I --> B
    E --> G[KPI dashboard]
    E --> H[Analyst copilot]
```

## Core Features

- CSV upload with a documented data contract
- Downloadable sample dataset for demonstrations
- Required-column and row-level validation
- Safe automatic correction of whitespace, casing, dates, and formatted numbers
- Exact-duplicate removal and conflicting-ID quarantine
- Invalid-row quarantine before aggregation
- Configurable revenue-per-order ceiling and conservative median/IQR outlier detection
- Source-verified revenue-exception approval that preserves the original value and requires an audit reason
- Row-level quarantine table with the original value and validation reason
- Fifteen-record queue pages with a sticky header, internal scrolling, search, and issue filters
- Customer correction form that highlights the failed fields and preserves original values
- Automatic scrolling and selected-row feedback when individual review opens
- Downloadable quarantine correction CSV and governed batch re-upload
- Batch impact preview showing submitted, publishable, unresolved, duplicate, and trusted-row changes
- Full-contract revalidation before a corrected record can be republished
- Immediate KPI, cleaned-CSV, and analyst-query refresh after accepted corrections
- Session audit trail with source row and before/after values
- Pipeline status and execution trace
- Before-and-after data-quality comparison and transformation summary
- Downloadable cleaned CSV after a successful pipeline run
- Revenue, gross margin, on-time delivery, and order KPIs
- Regional revenue ranking
- Category margin analysis
- SQL-backed, dataset-aware question-and-answer experience
- Optional Microsoft Foundry agent integration through a separate FastAPI service
- Governed tool-call and evidence details displayed with every agent answer
- Explicit local SQL fallback when the agent service is unavailable
- Ranked answer tables, trusted-row coverage, and an expandable SQL execution trace
- Responsive layout for desktop, tablet, and mobile
- Portfolio disclosure and customer-data privacy notice

## Data Contract

Uploaded files must contain these columns:

| Column | Type | Description |
| --- | --- | --- |
| `order_id` | Text | Unique identifier for an order |
| `date` | Date | Order date in a parseable date format |
| `region` | Text | Sales or operating region |
| `category` | Text | Product category |
| `revenue` | Number | Revenue generated by the order |
| `cost` | Number | Cost associated with the order |
| `status` | Text | Delivery status, such as `Delivered` or `Late` |

The validation layer checks:

- Presence of all required columns
- Required text values
- Numeric revenue and cost values
- Non-negative financial values
- Cost greater than revenue as a quarantine condition
- Revenue above the configured per-order ceiling
- Adaptive revenue outliers when at least 20 numeric rows are available
- Parseable dates
- Exact duplicate records and conflicting duplicate order IDs

Safe formatting differences are corrected and logged. Exact duplicate records are removed once. Rows with missing values, invalid dates or numbers, negative financial values, cost above revenue, or conflicting duplicate IDs are quarantined rather than guessed. Only published rows are used for dashboard calculations.

### Revenue outlier policy

PulseOps starts with a configurable maximum of **$100,000 per order**. A revenue value above that ceiling is quarantined before KPI calculation. The customer can change the ceiling in the data-contract panel and revalidate the complete source file; every contract change appears in the decision audit.

For files with at least 20 valid numeric revenue values, an optional adaptive rule adds a second safeguard. A value is flagged statistically only when it is greater than **both** `10 × median revenue` and `Q3 + 3 × IQR`. The conservative combination reduces false positives while still catching values that are extreme relative to the current file.

The pipeline never replaces an outlier with an average or capped value. A reviewer either corrects it using a value verified from the source, or approves the original value as a legitimate exception with a written reason. Approval removes only the revenue-outlier finding; any other failed rule keeps the record quarantined.

## Scale and Production Boundary

The portfolio application keeps data in the browser so anyone can test it without accounts or infrastructure. Its queue is designed to remain usable when a file contains many exceptions because it renders only 15 records at a time and supports batch correction. However, a real production workload of 100,000 or more records should move parsing, validation, persistence, and background execution to server-side services and a database or warehouse. The browser should receive paginated results rather than holding the full operational dataset.

At production scale, teams should correct recurring problems in the source system or apply an approved deterministic rule. Individual review is reserved for unusual exceptions whose intended value requires business confirmation.

## KPI Definitions

| KPI | Calculation |
| --- | --- |
| Total revenue | Sum of revenue across valid rows |
| Gross margin | `(revenue - cost) / revenue` |
| On-time rate | Non-late orders divided by valid orders |
| Source quality | A demonstration score reduced by findings, required corrections, and duplicates |
| Published quality | Percentage indicating whether the released rows pass all publish rules |

## Governed Analyst Copilot

In standalone mode, the copilot runs real SQL against an in-memory `trusted_sales` table created from the currently published rows. For example, asking `Show the top 2 regions by revenue` executes an approved aggregation with `GROUP BY`, `ORDER BY`, and `LIMIT 2`, then returns the ranked answer, revenue values, order counts, trusted-row coverage, and the exact SQL statement.

It can answer:

- Which regions lead revenue, including the requested top 1–5
- Which categories have the strongest margin, including the requested top 1–5
- Whether data-quality issues were detected
- Where operations should investigate late orders
- Overall revenue, order count, and margin

Natural-language wording never becomes free-form SQL. The standalone path selects only from allowlisted in-browser query templates, so the public demo remains usable without API credentials or a backend.

For a local full-stack demonstration, set `NEXT_PUBLIC_PULSEOPS_AGENT_API_URL` to the separately running PulseOps AI Agent. The dashboard lazily imports only the active synthetic pipeline, including exact `source_row` lineage, and then sends the question with the returned pipeline identifier. The FastAPI service scopes the conversation to that pipeline, lets Microsoft Foundry select only from five approved read-only tools, constructs the factual answer from validated tool output, and returns the provider, tool calls, evidence, and audit identifiers. If the service is unavailable, the interface clearly labels and uses the governed local SQL fallback instead of pretending an agent answered.

The agent API is currently a local-development service. It must receive inbound authentication, user-to-pipeline authorization, rate limits, and production secret management before it is exposed publicly. No Azure credential or API key is included in the browser bundle.

## Try It

1. Open the [live application](https://pulseops-krishna-mvwala.krishna-mvwala.workers.dev).
2. Select **Download sample CSV** or use [`sample-data/pulseops_sample_sales.csv`](sample-data/pulseops_sample_sales.csv).
3. Upload the file.
4. Confirm that the raw file is extracted but still waiting for ETL.
5. Select **Run ETL pipeline**.
6. Review safe corrections, removed duplicates, and the row-level quarantine reasons.
7. Inspect **Revenue outlier guardrail**. Change the ceiling only when the customer contract requires it, then select **Apply & revalidate**.
8. Search or filter the queue and confirm that only 15 records are rendered per page.
9. For a single unusual exception, select **Review & correct**. Enter a source-verified replacement and choose **Validate & republish**, or document why the unchanged value is legitimate and choose **Approve exception & revalidate**.
10. For a larger correction set, select **Download queue CSV**, edit verified values without changing `source_row`, and upload the file with **Upload corrected CSV**.
11. Review the batch preview, apply it, and confirm passing rows publish while unresolved rows remain quarantined.
12. Confirm the trusted-row count, KPIs, cleaned CSV, and decision audit update.
13. Download the cleaned CSV and inspect the executive KPIs.
14. Ask Pulse: `Show the top 2 regions by revenue`.
15. In standalone mode, expand **View SQL executed**. With the AI Agent configured, confirm that the answer instead shows the Foundry provider, governed tool name, and evidence reference.

## Run Locally

### Requirements

- Node.js 22.13 or newer
- npm

### Installation

```bash
git clone https://github.com/krishnamvwala/pulseops-forward-deployed-analytics.git
cd pulseops-forward-deployed-analytics
npm ci --include=dev
npm run dev
```

The lockfile selects the correct native packages automatically for Apple Silicon,
Intel macOS, Windows, or Linux. Open the local URL printed by the development
server.

The dashboard does not require a backend. To test the optional PulseOps AI Agent
integration, copy `.env.example` to `.env.local`, keep the default local API URL,
and run the separate agent repository on port `8000` before starting this app:

```dotenv
NEXT_PUBLIC_PULSEOPS_AGENT_API_URL=http://127.0.0.1:8000/api/v1
```

### Build Validation

```bash
npm run build
```

## Technology

- React 19
- TypeScript
- Next.js-compatible application structure
- vinext and Vite
- Cloudflare-compatible deployment output
- AlaSQL for browser-side SQL execution over trusted rows
- Optional FastAPI and Microsoft Foundry agent integration
- CSS-based responsive dashboard visualization
- Browser `FileReader` and client-side CSV processing

No database, external API, or authentication is required for standalone browser mode. The optional local agent uses its own governed API and database; public deployment requires authentication and authorization first.

## Project Structure

```text
LICENSE              Portfolio-evaluation terms and commercial-use restrictions
app/
  etl.ts           Extraction, validation, transformation, quarantine, and CSV export
  globals.css       Application design system and responsive layout
  layout.tsx        Metadata and social-sharing configuration
  page.tsx          Interactive pipeline controls, KPIs, and copilot
  sql-analyst.ts    Approved question templates, in-memory SQL, and formatted answers
public/
  og.png            Social-sharing preview
sample-data/
  pulseops_sample_sales.csv
docs/
  PROJECT_REPORT.md Detailed case study and implementation report
tests/
  etl.test.mjs      Messy-data transformation and quarantine tests
  rendered-html.test.mjs
  sql-analyst.test.mjs
.openai/
  hosting.json      Hosting configuration
```

## Forward-Deployed Engineering Skills Demonstrated

- Translating a customer objective into technical requirements
- Defining a data contract and validation rules
- Building a usable end-to-end solution instead of an isolated component
- Designing for business users and technical operators
- Communicating data lineage, quality, and KPI definitions
- Protecting customer information through a synthetic-data portfolio scenario
- Explaining limitations and planning production extensions

For the complete case study, see [Project Report](docs/PROJECT_REPORT.md).

## Current Limitations

- Uploaded data remains only in the current browser session.
- The CSV parser is intentionally lightweight and is not intended for very large files.
- The copilot is analytical and deterministic; it is not connected to an LLM.
- The demo does not include authentication, durable storage, scheduling, or role-based access.

These boundaries are intentional for a safe, portable portfolio demonstration. The project report describes how each area could be extended for production.

## License and Permitted Use

Copyright © 2026 Krishna Mvwala. All rights reserved.

PulseOps is publicly source-available for portfolio review and recruitment evaluation. You may view, clone, and run the project for non-commercial evaluation. You may not sell, commercialize, redistribute, sublicense, remove the ownership notice, or present the project as another person's original work without written permission from Krishna Mvwala.

This is not an open-source license. See the full [PulseOps Portfolio Evaluation License](LICENSE) for the controlling terms. Third-party packages remain subject to their own licenses.

## Author

**Krishna Mvwala**

Senior Data Analyst | Data Engineering | Forward-Deployed Analytics

This is an independent portfolio project. All organizations, scenarios, and data shown in the application are fictional or synthetic. No confidential client, employer, patient, or customer data is used.
