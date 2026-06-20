/**
 * Minimal stdio JSON-RPC client for the MongoDB MCP server.
 * Spawned lazily on first use; reused across calls.
 *
 * https://github.com/mongodb-js/mongodb-mcp-server
 *
 * ON BY DEFAULT — set MNEMOS_USE_MCP=0 to opt out. When the server can't be
 * spawned or a call fails, the helpers return null and callers fall back to
 * direct Mongo access, so nothing breaks if the MCP server is unavailable.
 */

import { spawn, type ChildProcessByStdio } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { config } from "../config.js";

interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type Proc = ChildProcessByStdio<Writable, Readable, Readable>;

// On by default; explicit "0" disables. This makes the MCP server the primary
// data path for retrieval (per the architectural commitment), with a safe
// fallback to the direct driver when it's unavailable.
const USE_MCP = process.env["MNEMOS_USE_MCP"] !== "0";

export function isMcpEnabled(): boolean {
  return USE_MCP;
}

let proc: Proc | null = null;
let buffer = "";
let nextId = 1;
const pending = new Map<number, (r: RpcResponse) => void>();
let initialized = false;
// Circuit breaker: once the MCP server fails to spawn/initialize, stop retrying
// for the rest of the process so we don't re-pay the spawn+timeout cost on every
// search. Callers fall back to the direct Mongo driver.
let mcpBroken = false;

function spawnServer(): Proc {
  const args = [
    "-y",
    "mongodb-mcp-server",
    "--connectionString",
    config.MONGODB_URI,
  ];
  const child = spawn("npx", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, MDB_MCP_TELEMETRY: "0" },
  }) as Proc;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as RpcResponse;
        if (typeof msg.id === "number" && pending.has(msg.id)) {
          const resolve = pending.get(msg.id)!;
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        // not a response; ignore
      }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (process.env["MNEMOS_MCP_DEBUG"] === "1") {
      process.stderr.write(`[mcp] ${chunk}`);
    }
  });
  child.on("exit", (code) => {
    if (process.env["MNEMOS_MCP_DEBUG"] === "1") {
      process.stderr.write(`[mcp] exited code=${code}\n`);
    }
    proc = null;
    initialized = false;
    pending.clear();
  });
  return child;
}

function send(req: RpcRequest): Promise<RpcResponse> {
  if (!proc) throw new Error("mcp: server not spawned");
  return new Promise((resolve, reject) => {
    const id = req.id;
    pending.set(id, resolve);
    proc!.stdin.write(JSON.stringify(req) + "\n", (err) => {
      if (err) {
        pending.delete(id);
        reject(err);
      }
    });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`mcp: timeout on ${req.method}`));
      }
    }, 20000);
  });
}

async function ensure(): Promise<void> {
  if (!USE_MCP || mcpBroken) throw new Error("mcp: disabled or unavailable");
  if (initialized) return;
  try {
    if (!proc) proc = spawnServer();
    const initRes = await send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mnemos-agent", version: "0.0.1" },
      },
    });
    if (initRes.error) throw new Error(`mcp init: ${initRes.error.message}`);
    // notification — no response expected
    proc!.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
    initialized = true;
  } catch (err) {
    // Trip the breaker: don't keep retrying a broken MCP server every search.
    mcpBroken = true;
    try { proc?.kill(); } catch { /* noop */ }
    proc = null;
    initialized = false;
    if (process.env["MNEMOS_MCP_DEBUG"] === "1") {
      process.stderr.write(`[mcp] disabled after init failure: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    throw err;
  }
}

function parseAggregateResult(raw: unknown): Array<Record<string, unknown>> | null {
  const result = raw as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
  };
  if (result?.structuredContent && Array.isArray(result.structuredContent)) {
    return result.structuredContent as Array<Record<string, unknown>>;
  }
  // The MongoDB MCP server can also wrap the documents under a key.
  if (
    result?.structuredContent &&
    typeof result.structuredContent === "object" &&
    Array.isArray((result.structuredContent as { documents?: unknown }).documents)
  ) {
    return (result.structuredContent as { documents: Array<Record<string, unknown>> }).documents;
  }
  const textPart = result?.content?.find((c) => c.type === "text")?.text;
  if (textPart) {
    try {
      const parsed = JSON.parse(textPart) as unknown;
      if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { documents?: unknown }).documents)) {
        return (parsed as { documents: Array<Record<string, unknown>> }).documents;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Run an arbitrary read aggregation against `chunks` (or any collection) through
 * the MCP server's `aggregate` tool. Returns null (→ caller falls back to the
 * driver) when MCP is disabled, unavailable, or the call errors.
 */
export async function aggregateViaMcp(
  collection: string,
  pipeline: Record<string, unknown>[],
): Promise<Array<Record<string, unknown>> | null> {
  if (!USE_MCP || mcpBroken) return null;
  try {
    await ensure();
    const res = await send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: {
        name: "aggregate",
        arguments: {
          database: config.MONGODB_DB,
          collection,
          pipeline,
        },
      },
    });
    if (res.error) {
      if (process.env["MNEMOS_MCP_DEBUG"] === "1") {
        process.stderr.write(`[mcp] aggregate error: ${res.error.message}\n`);
      }
      return null;
    }
    return parseAggregateResult(res.result);
  } catch {
    return null;
  }
}

interface SearchViaMcpArgs {
  index: string;
  queryVector: number[];
  limit: number;
  source?: string;
}

export async function searchViaMcp(
  args: SearchViaMcpArgs,
): Promise<Array<Record<string, unknown>> | null> {
  const pipeline: Record<string, unknown>[] = [
    {
      $vectorSearch: {
        index: args.index,
        path: "embedding",
        queryVector: args.queryVector,
        numCandidates: Math.max(100, args.limit * 10),
        limit: args.limit,
        ...(args.source ? { filter: { source: args.source } } : {}),
      },
    },
    {
      $project: {
        _id: 1,
        documentId: 1,
        source: 1,
        title: 1,
        text: 1,
        ordinal: 1,
        metadata: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];
  return aggregateViaMcp("chunks", pipeline);
}

export function shutdownMcp(): void {
  if (proc) {
    try { proc.kill(); } catch { /* noop */ }
  }
  proc = null;
  initialized = false;
  pending.clear();
}
