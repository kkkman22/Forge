import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Respawn_Budget: atomic file-based counter (R13.12–R13.14).
 * Limits how many times sync-once can respawn mirror daemon.
 */

function readCount(file) {
  try {
    if (!existsSync(file)) return 0;
    const raw = readFileSync(file, "utf-8").trim();
    const n = JSON.parse(raw);
    return typeof n === "number" && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCount(file, count) {
  const dir = dirname(file);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(count));
  renameSync(tmp, file);
}

/**
 * Try to consume one respawn unit. Returns true if within budget (R13.12).
 * Atomic: read → check → write via tmp+rename.
 */
export function tryConsumeRespawn(file, maxRespawns) {
  const count = readCount(file);
  if (count >= maxRespawns) return false;
  writeCount(file, count + 1);
  return true;
}

/**
 * Reset respawn counter (R13.13). Called at session boundaries.
 */
export function resetRespawnCount(file) {
  writeCount(file, 0);
}
