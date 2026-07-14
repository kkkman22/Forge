#!/usr/bin/env node
/**
 * Mirror_Daemon — watches .forge/ state and projects to cmux.
 * 12-step startup, fs.watch / polling dual mode, debounce 250ms.
 */

import { existsSync, watch, statSync } from "node:fs";
import { join } from "node:path";
import { cmuxAvailable } from "./lib/availability.mjs";
import { loadCapabilities, hasCapability } from "./lib/capabilities.mjs";
import { readForgeState } from "./lib/reader.mjs";
import { emitCommands } from "./lib/emitter.mjs";
import { runCli, buildRpcArgs } from "./lib/cli.mjs";
import { raiseActiveWorkspace } from "./lib/workspace-reorder.mjs";
import { createSessionTracker } from "./lib/session.mjs";
import { createPushServer } from "./lib/push-server.mjs";
import { readEventsSince } from "./lib/events.mjs";

const DEBOUNCE_MS = 250;
const DEFAULT_POLL_MS = 1000;

/**
 * Create a debouncer (R1.8). Collects notifications within windowMs,
 * fires callback once with the last path.
 */
export function createDebouncer(windowMs, callback) {
  let timer = null;
  return {
    notify(path) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        callback(path);
      }, windowMs);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * Dispatch commands to cmux CLI.
 */
async function dispatchCommands(commands) {
  for (const cmd of commands) {
    if (!hasCapability(cmd.method)) continue;
    try {
      const args = buildRpcArgs(cmd);
      await runCli(args, { timeoutMs: 2000 });
    } catch {
      // Best-effort dispatch (R13.5)
    }
  }
}

/**
 * Create and start Mirror_Daemon (R1.5–R1.10).
 * Returns { started: true, shutdown } or { started: false, reason }.
 * @param {{ forgeDir?: string, socketDir?: string, cmuxAvailable?: boolean, forcePolling?: boolean, pollIntervalMs?: number }} opts
 */
export async function createMirrorDaemon({
  forgeDir = ".forge",
  socketDir = "/tmp",
  cmuxAvailable: isAvailable = cmuxAvailable(),
  forcePolling = false,
  pollIntervalMs = DEFAULT_POLL_MS,
} = {}) {
  // Step 1: Check cmux availability (R1.5)
  if (!isAvailable) {
    return { started: false, reason: "cmux_unavailable" };
  }

  // Step 2: Check forgeDir exists (R1.6)
  if (!existsSync(forgeDir)) {
    return { started: false, reason: "forge_dir_missing" };
  }

  // Step 3: Load capabilities
  await loadCapabilities();

  // Step 4: Initialize state
  let currentState = readForgeState(forgeDir);
  let eventCursor = 0;

  // Step 5: Session tracker
  const session = createSessionTracker({
    defaultBudget: 20,
    onStatusChange() {
      // Track session transitions for push notifications
    },
  });

  // Step 6: Push server (R17)
  const pushSocketPath = join(socketDir, "mirror-push.sock");
  let pushServer = null;
  try {
    pushServer = await createPushServer({
      socketPath: pushSocketPath,
      dispatch: (event) => {
        session.onEvent("default", event.type);
      },
    });
  } catch {
    // Push server optional — continue without it
  }

  // Step 7: Events cursor
  const eventsPath = join(forgeDir, "events.ndjson");
  if (existsSync(eventsPath)) {
    eventCursor = statSync(eventsPath).size;
  }

  // State change handler
  let shuttingDown = false;
  // P2-3d: single-flight guard. handleStateChange is async with await points
  // (readEventsSince, dispatchCommands). The debouncer's setTimeout can't
  // await it, so a second notification during the first's await window would
  // re-enter → same events consumed twice, currentState RMW lost. The guard
  // serializes: if a run is in flight, mark pending and re-run once it lands.
  let runInFlight = false;
  let pendingRun = false;

  async function handleStateChange(_changedPath) {
    if (shuttingDown) return;
    if (runInFlight) {
      // Another run is mid-await — coalesce: run once more after it finishes.
      pendingRun = true;
      return;
    }
    runInFlight = true;
    try {
      do {
        pendingRun = false;
        try {
          const nextState = readForgeState(forgeDir);

          // Check events — P2-3b: use the cursor returned by readEventsSince (which
          // only advances to the last complete line). The prior statSync(size) leap
          // past torn tail lines made event loss deterministic.
          if (existsSync(eventsPath)) {
            const { events, cursor } = await readEventsSince(eventsPath, eventCursor);
            eventCursor = cursor;
            for (const event of events) {
              session.onEvent("default", event.type);
            }
          }

          // Emit commands if state changed
          const commands = emitCommands(currentState, nextState);
          if (commands.length > 0) {
            currentState = nextState;
            await dispatchCommands(commands);
          }
        } catch {
          // Best-effort sync (R13.5)
        }
      } while (pendingRun && !shuttingDown);
    } finally {
      runInFlight = false;
    }
  }

  // Step 8: Watch or poll (R1.7, R1.10)
  const debounce = createDebouncer(DEBOUNCE_MS, handleStateChange);
  let watcher = null;
  let pollTimer = null;

  if (!forcePolling) {
    try {
      watcher = watch(forgeDir, { recursive: true }, (_eventType, filename) => {
        if (filename) {
          debounce.notify(filename.toString());
        }
      });
      watcher.on("error", () => {
        // Fall back to polling on watch error
        watcher = null;
        startPolling();
      });
    } catch {
      startPolling();
    }
  } else {
    startPolling();
  }

  function startPolling() {
    pollTimer = setInterval(() => {
      debounce.notify("poll");
    }, pollIntervalMs);
  }

  // Step 9: Initial sync
  await handleStateChange("startup");

  // Raise the active Forge workspace to the front of its group (cmux 0.64.10+).
  // Zero-Impact: no-op when not running inside cmux (no CMUX_WORKSPACE_ID) or
  // when cmux lacks the `reorder-workspaces` command. The active ref is the
  // cmux workspace this daemon's pane lives in (per templates/cmux.json).
  await raiseActiveWorkspace({
    activeRef: process.env.CMUX_WORKSPACE_ID ?? "",
    windowId: process.env.CMUX_WINDOW_ID,
  });

  // Step 10-12: Signal handling, event loop
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    debounce.cancel();

    if (watcher) {
      watcher.close();
      watcher = null;
    }

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (pushServer) {
      await pushServer.close();
      pushServer = null;
    }
  };

  // Handle process signals
  const sigHandler = () => shutdown();
  process.on("SIGTERM", sigHandler);
  process.on("SIGINT", sigHandler);

  return { started: true, shutdown };
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== "--test") {
  const forgeDir = args[0] || ".forge";
  const socketDir = args[1] || "/tmp";

  createMirrorDaemon({ forgeDir, socketDir })
    .then((result) => {
      if (!result.started) {
        console.error(`mirror: not started — ${result.reason}`);
        process.exit(0);
      }
      console.log("mirror: daemon started");
    })
    .catch((err) => {
      console.error(`mirror: fatal — ${err.message}`);
      process.exit(1);
    });
}
