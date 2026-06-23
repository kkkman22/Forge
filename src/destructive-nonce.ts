/**
 * Destructive-guard nonce layer (v2 P0-2/P0-3 fix).
 *
 * Replaces the v1 bare-env-token bypass with a one-time, HMAC-verified nonce
 * written to a trusted file. The guard validates the nonce file + HMAC and
 * burns (deletes) the file on a successful bypass — ensuring:
 *   - single-use (can't be replayed)
 *   - unforgeable (attacker can't fabricate without the project secret)
 *   - not env-only (writing ~/.zshenv no longer disables the guard)
 *
 * Project secret derivation: stable per-repo value from `.forge/config.md`
 * mtime + project path (good enough for local-agent trust boundary; this is
 * not a networked threat model). For higher assurance, callers may inject a
 * secret via FORGE_DESTRUCTIVE_SECRET.
 *
 * **Validates: Requirements R1 AC2, AC3 (v2)**
 */

import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DestructiveContext } from "./destructive-guard.js";

const ROLLBACK_NONCE_FILE = ".rollback-nonce";
const ALLOW_NONCE_FILE = ".allow-destructive-nonce";

/**
 * v3: HMAC secret source. Does NOT derive from repo-readable/mutable file
 * attributes (config.md mtime — a runaway agent can stat+recompute). Instead
 * uses a one-time random `.forge/.guard-secret` (0600, auto-generated on first
 * use, stable thereafter). FORGE_DESTRUCTIVE_SECRET env remains an explicit
 * override.
 */
function getGuardSecret(projectRoot: string): string {
  const explicit = process.env.FORGE_DESTRUCTIVE_SECRET;
  if (explicit && explicit.trim() !== "") return explicit;

  const secretPath = join(projectRoot, ".forge", ".guard-secret");
  try {
    return readFileSync(secretPath, "utf-8").trim();
  } catch {
    // First use: generate a random secret, write 0600, return it.
    const generated = randomBytes(32).toString("hex");
    try {
      mkdirSync(dirname(secretPath), { recursive: true });
      writeFileSync(secretPath, generated, { mode: 0o600, encoding: "utf-8" });
    } catch {
      // If we can't persist, fall back to ephemeral random (still not derivable
      // from repo state; nonce just won't survive a process restart).
    }
    return generated;
  }
}

/** Compute HMAC of a nonce using the project secret. */
function hmacOf(nonce: string, projectRoot: string): string {
  return createHmac("sha256", getGuardSecret(projectRoot)).update(nonce).digest("hex");
}

/** Write a nonce file: `<nonce>\n<hmac>`. Returns the nonce. */
function writeNonceFile(projectRoot: string, filename: string): string {
  const nonce = randomBytes(16).toString("hex");
  const hmac = hmacOf(nonce, projectRoot);
  const filePath = join(projectRoot, ".forge", filename);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${nonce}\n${hmac}`, "utf-8");
  return nonce;
}

/** Issue a one-time rollback bypass nonce. Call before `git reset --hard`. */
export function issueRollbackNonce(projectRoot: string): string {
  return writeNonceFile(projectRoot, ROLLBACK_NONCE_FILE);
}

/** Issue a one-time user single-allow nonce. */
export function issueAllowNonce(projectRoot: string): string {
  return writeNonceFile(projectRoot, ALLOW_NONCE_FILE);
}

/**
 * Validate a nonce file: file exists + HMAC matches + (optionally) the env
 * carries the same nonce. Burns the file on success. Returns true if valid.
 *
 * v3 hardening (AC3a b/c): atomic burn via `rename` to a `.consumed/`
 * directory. rename is atomic on POSIX, so it doubles as a concurrency lock —
 * two hook processes racing on the same nonce: only the first rename succeeds,
 * the second gets ENOENT and returns false (no double-consume). If rename
 * fails for any reason, we treat the nonce as NOT consumed → return false
 * (fail-secure: refuse the bypass rather than risk replay).
 */
function consumeNonce(
  projectRoot: string,
  filename: string,
  envNonce: string | undefined,
): boolean {
  const filePath = join(projectRoot, ".forge", filename);
  if (!existsSync(filePath)) return false;

  // Atomic burn: rename nonce → .consumed/<filename>. If rename fails (already
  // consumed by a concurrent process, or permission), refuse this bypass.
  const consumedDir = join(projectRoot, ".forge", ".consumed");
  const consumedPath = join(consumedDir, filename);
  try {
    mkdirSync(consumedDir, { recursive: true });
    renameSync(filePath, consumedPath);
  } catch {
    return false; // fail-secure: rename failed → not consumed → deny
  }

  // Read the renamed (now-consumed) file for HMAC verification.
  let content: string;
  try {
    content = readFileSync(consumedPath, "utf-8");
  } catch {
    return false;
  }
  const lines = content.trim().split("\n");
  if (lines.length < 2) return false;
  const [nonce, hmac] = lines;
  // HMAC must verify (unforgeable).
  if (hmacOf(nonce, projectRoot) !== hmac) return false;
  // If env carries a nonce, it must match the file (belt-and-suspenders).
  if (envNonce !== undefined && envNonce !== "" && envNonce !== nonce) return false;
  return true;
}

/** Read config.md `destructive_guard` scalar (on → enabled). */
function guardEnabledFromConfig(projectRoot: string, configContent: string): boolean {
  // Prefer caller-supplied config text; fall back to reading the file.
  let content = configContent;
  if (!content) {
    try {
      content = readFileSync(join(projectRoot, ".forge", "config.md"), "utf-8");
    } catch {
      return true; // fail-secure: default on when unreadable
    }
  }
  const match = content.match(/^\s*destructive_guard:\s*(\S+)/m);
  return match ? match[1] !== "off" : true;
}

/**
 * Assemble a DestructiveContext from nonce files + config.
 * Burns valid nonces on read (single-use).
 */
export function contextFromNonce(
  env: NodeJS.ProcessEnv,
  projectRoot: string,
  configContent = "",
): DestructiveContext {
  const rollbackEnvNonce = env.FORGE_ROLLBACK_NONCE;
  const allowEnvNonce = env.FORGE_ALLOW_DESTRUCTIVE;
  return {
    rollbackActive: consumeNonce(projectRoot, ROLLBACK_NONCE_FILE, rollbackEnvNonce),
    userSingleAllow: consumeNonce(projectRoot, ALLOW_NONCE_FILE, allowEnvNonce),
    guardEnabled: guardEnabledFromConfig(projectRoot, configContent),
  };
}
