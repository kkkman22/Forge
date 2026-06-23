import { createHmac, randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  acquireLockSync,
  releaseLockSync,
  ToolHealthLockTimeoutError,
} from "../tool-health-writer.js";
import type { GateBlockReason } from "./cmux-gate.js";

export type { GateBlockReason } from "./cmux-gate.js";

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
  gate_result: "go" | "n_a" | "blocked";
  cmux_available: boolean | null;
  gate_reason: GateBlockReason | null;
}

export interface AuditOpts {
  auditDir?: string;
}

export interface SecretOpts {
  secretDir?: string;
}

const SECRET_FILE_NAME = ".audit-secret";

/**
 * Resolve the default directory for the audit secret file.
 * Uses CLAUDE_PLUGIN_DATA if set, otherwise falls back to ~/.claude/plugins/data/forge/.
 */
function resolveDefaultSecretDir(): string {
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData) return resolve(pluginData, "forge");
  return resolve(homedir(), ".claude", "plugins", "data", "forge");
}

/**
 * Get or create a random secret file for HMAC key derivation.
 *
 * P2-2 fix: replaces the old sha256(homedir()) fallback with a per-installation
 * random secret stored at 0600 permissions. The secret is a 32-byte random value
 * encoded as hex (64 chars).
 */
export function getOrCreateSecretFile(dir: string): string {
  const secretPath = resolve(dir, SECRET_FILE_NAME);

  if (existsSync(secretPath)) {
    try {
      const existing = readFileSync(secretPath, "utf-8").trim();
      if (existing.length >= 32) return existing;
    } catch {
      // Fall through to regenerate
    }
  }

  // Generate new random secret
  const secret = randomBytes(32).toString("hex");
  mkdirSync(dir, { recursive: true });
  writeFileSync(secretPath, secret, { mode: 0o600 });
  chmodSync(secretPath, 0o600);
  return secret;
}

/**
 * Resolve the HMAC secret key.
 *
 * Priority:
 * 1. FORGE_AUDIT_SECRET env var (explicit override)
 * 2. Random secret file at <dir>/.audit-secret
 * 3. Auto-generate a new random secret file
 */
export function resolveAuditSecret(opts?: SecretOpts): string {
  const env = process.env.FORGE_AUDIT_SECRET?.trim();
  if (env) return env;

  const dir = opts?.secretDir ?? resolveDefaultSecretDir();
  return getOrCreateSecretFile(dir);
}

export function computeHmac(
  prevHmac: string,
  entry: Omit<AuditEntry, "hmac">,
  opts?: SecretOpts,
): string {
  const key = resolveAuditSecret(opts);
  const data = prevHmac + JSON.stringify(entry);
  return createHmac("sha256", key).update(data).digest("hex");
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
    await mkdir(dir, { recursive: true });
  } catch (_err: unknown) {
    // biome-ignore lint/suspicious/noConsole: audit degradation warning is intentional
    console.warn(`[forge-audit] cannot create audit dir: ${dir}`);
    return;
  }

  const logPath = resolve(dir, "dispatch.log");
  const line = JSON.stringify(entry);

  // Serialise concurrent writers via the shared O_EXCL .lock primitive
  // (same one tool-health-writer uses, CHANGELOG F8). POSIX O_APPEND is atomic
  // only up to PIPE_BUF; audit entries are variable-length JSON, so concurrent
  // /forge subprocesses could otherwise tear/interleave records. The lock is a
  // short blocking sync call inside this async function — acceptable because
  // audit writes are infrequent and the critical section is a single line.
  // On lock timeout we degrade to the existing fail-soft behaviour (warn,
  // skip the write) rather than blocking dispatch.
  try {
    acquireLockSync(`${logPath}.lock`, { timeoutMs: 5_000 });
  } catch (_err: unknown) {
    if (_err instanceof ToolHealthLockTimeoutError) {
      // biome-ignore lint/suspicious/noConsole: audit degradation warning is intentional
      console.warn(`[forge-audit] lock timeout on ${logPath}, skipping write`);
      return;
    }
    throw _err;
  }

  try {
    appendFileSync(logPath, `${line}\n`);
  } catch (_err: unknown) {
    // biome-ignore lint/suspicious/noConsole: audit degradation warning is intentional
    console.warn(`[forge-audit] cannot write audit log: ${logPath}`);
  } finally {
    releaseLockSync(`${logPath}.lock`);
  }
}
