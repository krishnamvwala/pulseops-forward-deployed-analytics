# PulseOps Architecture

PulseOps separates data trust, business decisions, and AI assistance so that each layer can be inspected and tested independently.

![PulseOps architecture](assets/architecture.svg)

## Runtime boundaries

| Boundary | Responsibility | Current portfolio implementation | Production extension |
| --- | --- | --- | --- |
| Ingestion | Accept a documented sales extract without changing the source | Browser CSV upload | Object storage, file scanning, and scheduled ingestion |
| Data trust | Validate the contract, normalize safe values, remove exact duplicates, and quarantine ambiguous records | TypeScript ETL in the browser | Server-side jobs, durable lineage, and warehouse staging tables |
| Human review | Correct or approve exceptions with evidence and rerun the full contract | Individual and batch remediation with session audit | Workflow assignments, source-system writeback, and role-based approval |
| Decision layer | Calculate KPIs from trusted records only | In-browser analytical model and dashboard | Governed semantic layer and warehouse-backed BI |
| Investigation | Answer supported questions without unrestricted SQL | Allowlisted AlaSQL templates | Separate FastAPI service with Microsoft Foundry and five read-only tools |

## End-to-end data flow

1. PulseOps preserves each uploaded value and its `source_row` lineage.
2. Schema, completeness, type, date, uniqueness, financial, and outlier rules run before publication.
3. Deterministic formatting differences are normalized and recorded as corrections.
4. Records requiring business context are quarantined with the original value and a specific reason.
5. A reviewer can submit a source-verified row correction, approve a legitimate revenue exception, or upload a batch correction file.
6. Every candidate correction passes the complete contract again. Only passing records enter the trusted dataset.
7. Dashboard KPIs, cleaned CSV export, and analyst answers refresh from trusted rows only.
8. The separately deployed AI service imports the current pipeline with the same lineage, then lets Microsoft Foundry select only from approved read-only tools.

## Trust model

PulseOps does not equate transformation with guessing. A format such as `"1,200"` can be safely converted to `1200`; a missing revenue or impossible date cannot be reconstructed without evidence. The pipeline automates only deterministic changes and keeps uncertain business values in a visible review queue.

The AI layer follows the same principle. A model may choose an approved tool, but it does not receive database credentials or a free-form SQL endpoint. Factual answers are rendered from typed tool results and returned with evidence and audit identifiers.

## Current deployment boundary

The public Cloudflare application is intentionally portable: uploads stay in the browser, no account is required, and supported analytical questions use governed local SQL. The separate FastAPI/PostgreSQL/Microsoft Foundry service is available for local full-stack demonstrations. Before a public backend deployment it requires inbound identity, user-to-pipeline authorization, rate limits, durable secrets, monitoring, and retention controls.

For the complete delivery narrative, see the [Project Report](PROJECT_REPORT.md). For the interview walkthrough, see the [Demo Guide](DEMO_GUIDE.md).
