import { resolve } from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";

export interface AuditEntry {
  ts: string;
  sub: string;
  topic_hash: string;
  lib_hash: string;
  tools_granted: string[];
  dispatch_mode: string;
  outcome: "success" | "failure" | "rejected";
  prev_hmac: string;
  hmac: string;
}

export interface AuditOpts {
  auditDir?: string;
}

export function computeHmac(prevHmac: string, entry: Omit<AuditEntry, "hmac">): string {
  const data = prevHmac + JSON.stringify(entry);
  return createHash("sha256").update(data).digest("hex");
}

function resolveAuditDir(opts?: AuditOpts): string {
  if (opts?.auditDir) return opts.auditDir;

  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData) return resolve(pluginData, "forge", "audit");

  return resolve(homedir(), ".claude", "plugins", "data", "forge", "audit");
}

export async function appendAuditLog(entry: AuditEntry, opts?: AuditOpts): Promise<void> {
  const dir = resolveAuditDir(opts);

  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    console.warn(`[forge-audit] cannot create audit dir: ${dir}`);
    return;
  }

  const logPath = resolve(dir, "dispatch.log");
  const line = JSON.stringify(entry);

  try {
    appendFileSync(logPath, line + "\n");
  } catch {
    console.warn(`[forge-audit] cannot write audit log: ${logPath}`);
  }
}
