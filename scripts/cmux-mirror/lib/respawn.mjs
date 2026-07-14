import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
  // P3-6: PID-suffixed tmp so concurrent writers don't clobber each other's
  // temp file (was a fixed `${file}.tmp` name).
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(count));
  renameSync(tmp, file);
}

/**
 * Acquire an exclusive lock file via O_CREAT|O_EXCL, with brief retries.
 * P3-6: serializes the read-check-write RMW so two concurrent
 * tryConsumeRespawn calls can't both read the same count and both increment.
 */
function withLock(file, fn) {
  const lockPath = `${file}.lock`;
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let fd;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      fd = openSync(lockPath, "wx", 0o644);
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      // Stale lock? Steal if older than 5s.
      try {
        const { statSync } = require("node:fs");
        if (Date.now() - statSync(lockPath).mtimeMs > 5000) {
          try {
            unlinkSync(lockPath);
          } catch {
            /* race */
          }
        }
      } catch {
        /* ignore */
      }
      // brief spin
      const sab = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(sab), 0, 0, 50);
    }
  }
  if (fd === undefined) {
    // Could not acquire after retries — fail-open (best-effort, single-writer
    // is the normal case).
    return fn();
  }
  try {
    return fn();
  } finally {
    try {
      const currentPid = readFileSync(lockPath, "utf-8").trim();
      if (parseInt(currentPid, 10) === process.pid) unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  }
}

/**
 * Try to consume one respawn unit. Returns true if within budget (R13.12).
 * P3-6: the whole read → check → write is now lock-serialized (was non-atomic
 * despite the tmp+rename on the write alone).
 */
export function tryConsumeRespawn(file, maxRespawns) {
  return withLock(file, () => {
    const count = readCount(file);
    if (count >= maxRespawns) return false;
    writeCount(file, count + 1);
    return true;
  });
}

/**
 * Reset respawn counter (R13.13). Called at session boundaries.
 */
export function resetRespawnCount(file) {
  withLock(file, () => writeCount(file, 0));
}
