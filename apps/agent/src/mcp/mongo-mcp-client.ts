/**
 * Minimal stdio JSON-RPC client for the MongoDB MCP server.
 * Spawned lazily on first use; reused across calls.
 *
 * https://github.com/mongodb-js/mongodb-mcp-server
 *
 * Enabled via MNEMOS_USE_MCP=1. When disabled or unavailable, the helpers
 * here return null and callers fall back to direct Mongo access.
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

const USE_MCP = process.env["MNEMOS_USE_MCP"] === "1";

let proc: Proc | null = null;
let buffer = "";
let nextId = 1;
const pending = new Map<number, (r: RpcResponse) => void>();
let initialized = false;

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
  if (!USE_MCP) throw new Error("mcp: disabled (MNEMOS_USE_MCP != 1)");
  if (initialized) return;
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
  if (!USE_MCP) return null;
  try {
    await ensure();
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
    const res = await send({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: {
        name: "aggregate",
        arguments: {
          database: config.MONGODB_DB,
          collection: "chunks",
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
    const result = res.result as {
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
    };
    if (result?.structuredContent && Array.isArray(result.structuredContent)) {
      return result.structuredContent as Array<Record<string, unknown>>;
    }
    const textPart = result?.content?.find((c) => c.type === "text")?.text;
    if (textPart) {
      try {
        const parsed = JSON.parse(textPart) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as Array<Record<string, unknown>>;
        }
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function shutdownMcp(): void {
  if (proc) {
    try { proc.kill(); } catch { /* noop */ }
  }
  proc = null;
  initialized = false;
  pending.clear();
}
