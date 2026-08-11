import type {
  EtlResult,
  QuarantinedProblem,
  RawSalesRecord,
} from "./etl";

export type AgentStatus = {
  provider: "deterministic" | "foundry";
  configured: boolean;
  model: string | null;
  provider_authentication: "none" | "microsoft_entra_id";
  approved_tools: string[];
};

export type AgentToolUse = {
  tool_name: string;
  tool_call_id: string;
  evidence_count: number;
};

export type AgentEvidence = {
  evidence_type: "pipeline_run" | "trusted_record" | "quarantine_record" | "sql_query";
  reference_id: string;
  label: string;
  attributes: Record<string, unknown>;
};

export type AgentChatResponse = {
  correlation_id: string;
  conversation_id: string;
  provider: "deterministic" | "foundry";
  answer: string;
  tool_calls: AgentToolUse[];
  evidence: AgentEvidence[];
  requires_human_confirmation: boolean;
};

export type PipelineImportResponse = {
  id: string;
  source_row_count: number;
  trusted_row_count: number;
  quarantine_row_count: number;
};

export type PipelineImportPayload = {
  source_filename: string;
  imported_by: string;
  source_records: Array<{
    source_row: number;
    order_id: string | null;
    raw_payload: Record<string, string>;
  }>;
  trusted_records: Array<{
    source_row: number;
    order_id: string;
    order_date: string;
    region: string;
    category: string;
    revenue: number;
    cost: number;
    status: string;
  }>;
  quarantine_records: Array<{
    source_row: number;
    issue_codes: string[];
    issue_messages: string[];
    original_values: Record<string, string>;
    current_values: Record<string, string>;
  }>;
};

const configuredApiRoot = process.env.NEXT_PUBLIC_PULSEOPS_AGENT_API_URL?.trim();

export const pulseOpsAgentConfigured = Boolean(configuredApiRoot);

function apiUrl(path: string) {
  if (!configuredApiRoot) {
    throw new Error("The PulseOps AI Agent API is not configured.");
  }
  return `${configuredApiRoot.replace(/\/$/, "")}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null) as { detail?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.detail ?? `PulseOps AI Agent request failed (${response.status}).`);
  }
  return payload as T;
}

function normalizedIssueField(field: string) {
  return field
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "RECORD";
}

export function issueCodeForProblem(problem: QuarantinedProblem) {
  const message = problem.message.toLowerCase();
  const field = normalizedIssueField(problem.field);
  if (message.includes("required value is missing")) return `MISSING_${field}`;
  if (message.includes("expected a numeric value")) return `INVALID_${field}`;
  if (message.includes("negative financial value")) return "NEGATIVE_FINANCIAL_VALUE";
  if (message.includes("cost exceeds revenue")) return "COST_EXCEEDS_REVENUE";
  if (message.startsWith("revenue outlier:")) return "REVENUE_OUTLIER";
  if (problem.field === "date") return "INVALID_DATE";
  if (message.includes("conflicting duplicate")) return "CONFLICTING_DUPLICATE_ID";
  return `DATA_CONTRACT_${field}`;
}

export function buildAgentPipelineImport(
  sourceFilename: string,
  rawRecords: RawSalesRecord[],
  result: EtlResult,
): PipelineImportPayload {
  const rawBySourceRow = new Map(rawRecords.map((record) => [record.sourceRow, record]));
  return {
    source_filename: sourceFilename,
    imported_by: "pulseops-browser",
    source_records: rawRecords.map((record) => ({
      source_row: record.sourceRow,
      order_id: record.values.order_id.trim() || null,
      raw_payload: { ...record.values },
    })),
    trusted_records: result.trustedRecords.map(({ sourceRow, row }) => ({
      source_row: sourceRow,
      order_id: row.order_id,
      order_date: row.date,
      region: row.region,
      category: row.category,
      revenue: row.revenue,
      cost: row.cost,
      status: row.status,
    })),
    quarantine_records: result.quarantinedRecords.map((record) => {
      const rawRecord = rawBySourceRow.get(record.sourceRow);
      const originalValues = rawRecord ? { ...rawRecord.values } : {};
      return {
        source_row: record.sourceRow,
        issue_codes: record.problems.map(issueCodeForProblem),
        issue_messages: record.problems.map((problem) => problem.message),
        original_values: originalValues,
        current_values: originalValues,
      };
    }),
  };
}

export function getAgentStatus() {
  return requestJson<AgentStatus>("/agent/status");
}

export function importAgentPipeline(payload: PipelineImportPayload) {
  return requestJson<PipelineImportResponse>("/pipelines/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function askPulseOpsAgent(
  pipelineRunId: string,
  message: string,
  conversationId: string | null,
) {
  return requestJson<AgentChatResponse>("/agent/chat", {
    method: "POST",
    body: JSON.stringify({
      pipeline_run_id: pipelineRunId,
      message,
      conversation_id: conversationId,
      user_id: "pulseops-portfolio-user",
    }),
  });
}
