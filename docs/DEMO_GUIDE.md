# PulseOps Interview Demo Guide

This guide presents PulseOps as a customer problem solved end to end—not as a list of screens. A focused demonstration takes about six minutes.

## The story in one sentence

A multi-region retailer receives inconsistent daily sales files, so I built a governed workflow that isolates unsafe data, publishes KPIs from trusted records only, and gives analysts evidence-backed answers.

## Six-minute walkthrough

### 1. Frame the customer problem — 30 seconds

Start on **Overview**.

> “The customer needed reliable revenue, margin, and delivery reporting before 8 AM. Regional CSVs arrived with inconsistent formats and occasionally ambiguous business values, so the first requirement was trust—not just a dashboard.”

Call out the success criteria: reliable refresh, traceable quality, and actionable answers.

### 2. Show the contract-driven ETL — 60 seconds

Download the sample CSV, upload it, and select **Run ETL pipeline**.

Explain that:

- Extract preserves the original values and source-row lineage.
- Validate checks the documented schema and business rules.
- Transform normalizes only values that can be corrected safely.
- Publish makes only fully valid records available to KPIs.

### 3. Explain quarantine and remediation — 90 seconds

Use a deliberately messy CSV if you want to show the exception workflow. Open **Review & correct** on one record.

> “A missing revenue, impossible date, conflicting duplicate ID, or extreme order value cannot be safely guessed. PulseOps quarantines it, shows the evidence, and waits for confirmation from the source system or record owner.”

Enter a verified correction and select **Validate & republish**. Point out that the complete contract runs again, the trusted-row count updates, and the decision audit records the before/after values. Mention the correction CSV workflow for larger exception queues.

### 4. Move from trusted data to decisions — 60 seconds

Scroll to **Executive performance**.

Explain that revenue, gross margin, on-time delivery, regional ranking, and category economics are calculated from trusted rows only. Quarantined records cannot silently distort the result.

### 5. Ask an evidence-backed question — 90 seconds

Open **Ask Pulse AI** and select:

> “Show the top 2 regions by revenue.”

In the public demo, PulseOps maps the request to an allowlisted SQL template and exposes the executed SQL and trusted-row coverage. In the local full-stack demo, the separate FastAPI service can route the question through Microsoft Foundry, execute an approved read-only tool, and return evidence plus audit identifiers.

### 6. Close with the engineering decisions — 60 seconds

Summarize three choices:

1. **Trust before speed:** ambiguous values are quarantined instead of invented.
2. **Human authority:** remediation requires verified input and full revalidation.
3. **Governed AI:** the model selects from five read-only tools; it does not receive unrestricted SQL or mutation rights.

Then explain the production boundary: move large-file processing and durable state to server-side jobs and a warehouse, add identity and authorization to the API, and retain the same contracts, lineage, tests, and audit principles.

## Questions to invite

- Why did you choose quarantine instead of automatic imputation?
- How does a corrected record become trusted?
- How would this handle 100,000 rows?
- How are revenue outliers detected and approved?
- What prevents the agent from changing data or executing arbitrary SQL?
- What would you add before exposing the FastAPI service publicly?

## Links

- [Live application](https://pulseops-krishna-mvwala.krishna-mvwala.workers.dev)
- [Application source](https://github.com/krishnamvwala/pulseops-forward-deployed-analytics)
- [AI Agent source](https://github.com/krishnamvwala/pulseops-ai-agent)
- [Architecture](ARCHITECTURE.md)
- [Detailed project report](PROJECT_REPORT.md)
