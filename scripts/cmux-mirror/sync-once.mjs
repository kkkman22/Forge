#!/usr/bin/env node
/**
 * sync-once.mjs — Hook-triggered one-shot sync (R2.7–R2.10, R13.12–R13.14).
 * 9-step flow: availability → forge-dir check → lock → respawn → read → emit → diff → dispatch → snapshot.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { shouldSkipForSubagent } from "../lib/hook-stdin-router.mjs";
import { cmuxAvailable } from "./lib/availability.mjs";
import { readForgeState } from "./lib/reader.mjs";
import { emitCommands } from "./lib/emitter.mjs";
import { runCli, buildRpcArgs } from "./lib/cli.mjs";
import { tryConsumeRespawn } from "./lib/respawn.mjs";

const MAX_RESPAWNS = 3;
const SNAPSHOT_FILE = ".cmux-snapshot.json";
const LOCK_FILE = ".cmux-sync.lock";

/**
 * Run a one-shot sync from .tinkerman/ state to cmux (R2.7).
 * Returns { synced: boolean, commandsEmitted: number, reason?: string }.
 */
export async function syncOnce({
  forgeDir = ".tinkerman",
  snapshotDir = ".tinkerman",
} = {}) {
  // Step 1: Check cmux availability (R2.7)
  if (!cmuxAvailable()) {
    return { synced: false, commandsEmitted: 0, reason: "cmux_unavailable" };
  }

  // Step 2: Check forge dir exists (R2.7)
  if (!existsSync(forgeDir)) {
    return { synced: false, commandsEmitted: 0, reason: "forge_dir_missing" };
  }

  // Step 3: Acquire lock atomically (P2-3a: was existsSync+writeFileSync
  // TOCTOU — both procs entered the critical section → duplicate cmux dispatch).
  // Now O_CREAT|O_EXCL: only one writer wins. Loser either bails (fresh lock)
  // or steals (stale lock whose holder PID is dead). Lock stores PID for the
  // liveness probe.
  const lockPath = join(snapshotDir, LOCK_FILE);
  // 5s staleness matches the prior lock convention (lock content was a
  // timestamp; stale = older than 5s). We write PID now, but keep 5s so the
  // existing lock semantics + tests are preserved.
  const LOCK_STALE_MS = 5_000;
  let acquired = false;
  for (let attempt = 0; attempt < 10 && !acquired; attempt++) {
    try {
      const fd = openSync(lockPath, "wx", 0o644); // O_CREAT|O_EXCL|O_WRONLY
      writeFileSync(fd, `${process.pid}`);
      closeSync(fd);
      acquired = true;
    } catch (err) {
      if (err.code !== "EEXIST") {
        return { synced: false, commandsEmitted: 0, reason: "lock_failed" };
      }
      // Lock exists — check staleness before stealing.
      try {
        let lockContent = "";
        try {
          lockContent = readFileSync(lockPath, "utf-8").trim();
        } catch {
          // corrupt/unreadable — steal
        }
        // Lock content is either a bare timestamp (legacy) or a PID. A
        // timestamp older than LOCK_STALE_MS → stale. A PID → check liveness.
        const num = parseInt(lockContent, 10);
        const isPlausiblePid = num > 0 && num < 4_000_000; // PIDs are < ~4M
        let stale = false;
        if (isPlausiblePid) {
          // PID-form lock — stale if the holder process is dead.
          try {
            process.kill(num, 0); // throws if dead
            // alive — not stale
          } catch {
            stale = true;
          }
        } else {
          // Legacy timestamp-form lock — stale if older than LOCK_STALE_MS.
          // (mtime reflects when the file was written; for legacy locks the
          // content timestamp approximates this, but we use mtime for accuracy.)
          const { statSync } = await import("node:fs");
          stale = Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS;
          // If the content is a large timestamp (legacy), also honor it:
          if (Number.isFinite(num) && num > 4_000_000) {
            stale = stale || Date.now() - num > LOCK_STALE_MS;
          }
        }
        if (stale) {
          try {
            unlinkSync(lockPath);
          } catch {
            // race — peer removed it; retry will O_EXCL
          }
        }
      } catch {
        // stat failed — retry
      }
      if (!acquired) {
        const { Atomics } = globalThis;
        if (Atomics) {
          const sab = new SharedArrayBuffer(4);
          Atomics.wait(new Int32Array(sab), 0, 0, 100);
        }
      }
    }
  }
  if (!acquired) {
    return { synced: false, commandsEmitted: 0, reason: "locked" };
  }

  try {
    // Step 4: Respawn budget check (R13.12–R13.14)
    // Not consumed here — consumed only when mirror respawn is attempted

    // Step 5: Read current Forge state
    const nextState = readForgeState(forgeDir);

    // Step 6: Read previous snapshot
    const snapshotPath = join(snapshotDir, SNAPSHOT_FILE);
    let prevState = {
      phase: "unknown",
      tier: null,
      task: null,
      progress: { total: 0, done: 0, in_progress: 0, pending: 0 },
      review: null,
    };
    if (existsSync(snapshotPath)) {
      try {
        prevState = JSON.parse(readFileSync(snapshotPath, "utf-8"));
      } catch {
        // Corrupt snapshot — treat as initial state
      }
    }

    // Step 7: Diff and generate commands (R12.10)
    const commands = emitCommands(prevState, nextState);

    // Step 8: Dispatch commands to cmux (R2.8)
    let commandsEmitted = 0;
    for (const cmd of commands) {
      try {
        const args = buildRpcArgs(cmd);
        await runCli(args, { timeoutMs: 2000 });
        commandsEmitted++;
      } catch {
        // Best-effort (R13.5)
      }
    }

    // Step 9: Update snapshot
    try {
      const tmpPath = `${snapshotPath}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(nextState));
      renameSync(tmpPath, snapshotPath);
    } catch {
      // Snapshot write failure — non-fatal
    }

    return { synced: true, commandsEmitted };
  } finally {
    // Release lock — P2-3a: re-verify we still own it (PID match) before
    // unlinking, so we don't delete a peer's freshly-acquired lock.
    try {
      const currentPid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
      if (currentPid === process.pid) {
        unlinkSync(lockPath);
      }
    } catch {
      // Lock gone or corrupt — non-fatal, will expire via staleness.
    }
  }
}

/**
 * Check respawn budget and optionally trigger mirror restart (R13.12).
 */
export async function syncOnceWithRespawn(opts = {}) {
  const respawnFile = opts.respawnFile ?? ".tinkerman/.cmux-respawn-count";
  const result = await syncOnce(opts);

  if (result.reason === "cmux_unavailable" || result.reason === "forge_dir_missing") {
    return result;
  }

  // If synced but no commands emitted (state unchanged), mirror may be down
  if (result.synced && result.commandsEmitted === 0) {
    if (tryConsumeRespawn(respawnFile, MAX_RESPAWNS)) {
      // Signal that respawn is recommended
      return { ...result, respawnRecommended: true };
    }
  }

  return result;
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== "--test") {
  if (await shouldSkipForSubagent()) process.exit(0);

  const forgeDir = args[0] || ".tinkerman";

  // Validate: reject path traversal
  if (forgeDir.includes("..")) {
    process.exit(0);
  }

  syncOnce({ forgeDir })
    .then((result) => {
      if (!result.synced) {
        process.exit(0);
      }
    })
    .catch(() => {
      process.exit(0);
    });
}
