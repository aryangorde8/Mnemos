import type { FunctionDeclaration } from "../lib/vertex.js";

export interface Citation {
  chunkId: string;
  documentId: string;
  source:
    | "email"
    | "calendar"
    | "meeting_notes"
    | "shared_doc"
    | "slack"
    | "notes";
  title: string;
  score: number;
  ordinal: number;
  text?: string;
}

export interface ToolContext {
  query?: string;
  runId?: string;
}

export interface ToolDef {
  declaration: FunctionDeclaration;
  handler: (
    args: Record<string, unknown>,
    ctx?: ToolContext,
  ) => Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  citations?: Citation[];
  summary?: string;
}

export interface UsageMetadata {
  promptTokens: number;
  candidatesTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
  // estimated USD cost based on Gemini 3 Pro preview rates
  estimatedCostUsd: number;
}

export type AgentEvent =
  | { kind: "start"; query: string; runId: string; at: number }
  | { kind: "thought"; chunk: string; at: number }
  | { kind: "tool_call"; id: string; name: string; args: Record<string, unknown>; at: number }
  | { kind: "observation"; id: string; name: string; result: ToolResult; durationMs: number; at: number }
  | { kind: "answer"; chunk: string; at: number }
  | { kind: "citations"; citations: Citation[]; at: number }
  | { kind: "done"; turns: number; totalMs: number; usage: UsageMetadata; at: number }
  | { kind: "error"; message: string; at: number };
