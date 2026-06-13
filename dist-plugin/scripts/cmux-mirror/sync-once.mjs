#!/usr/bin/env node
/**
 * sync-once.mjs — Hook-triggered one-shot sync (R2.7–R2.10, R13.12–R13.14).
 * 9-step flow: availability → forge-dir check → lock → respawn → read → emit → diff → dispatch → snapshot.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
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
 * Run a one-shot sync from .forge/ state to cmux (R2.7).
 * Returns { synced: boolean, commandsEmitted: number, reason?: string }.
 */
export async function syncOnce({
  forgeDir = ".forge",
  snapshotDir = ".forge",
} = {}) {
  // Step 1: Check cmux availability (R2.7)
  if (!cmuxAvailable()) {
    return { synced: false, commandsEmitted: 0, reason: "cmux_unavailable" };
  }

  // Step 2: Check forge dir exists (R2.7)
  if (!existsSync(forgeDir)) {
    return { synced: false, commandsEmitted: 0, reason: "forge_dir_missing" };
  }

  // Step 3: Acquire lock (prevent concurrent sync)
  const lockPath = join(snapshotDir, LOCK_FILE);
  if (existsSync(lockPath)) {
    try {
      const lockContent = readFileSync(lockPath, "utf-8").trim();
      const lockAge = Date.now() - parseInt(lockContent, 10);
      if (lockAge < 5000) {
        return { synced: false, commandsEmitted: 0, reason: "locked" };
      }
    } catch {
      // Stale or corrupt lock — proceed
    }
  }

  try {
    writeFileSync(lockPath, Date.now().toString());
  } catch {
    return { synced: false, commandsEmitted: 0, reason: "lock_failed" };
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
    // Release lock
    try {
      unlinkSync(lockPath);
    } catch {
      // Lock cleanup failure — non-fatal, will expire
    }
  }
}

/**
 * Check respawn budget and optionally trigger mirror restart (R13.12).
 */
export async function syncOnceWithRespawn(opts = {}) {
  const respawnFile = opts.respawnFile ?? ".forge/.cmux-respawn-count";
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

  const forgeDir = args[0] || ".forge";

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
