import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitCommands } from "../../scripts/cmux-mirror/lib/emitter.mjs";
import { readForgeState } from "../../scripts/cmux-mirror/lib/reader.mjs";
import type { MirrorDaemonStartResult } from "./types.js";

/**
 * Async poll-with-timeout helper. Repeatedly calls `fn` until it returns
 * truthy or `timeoutMs` elapses.
 */
async function waitFor<T>(
  fn: () => T | undefined | null,
  { timeoutMs = 3000, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined | null;
  while (Date.now() < deadline) {
    last = fn() as T | undefined | null;
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

function writeStatus(dir: string, phase: string, extra?: Record<string, string>) {
  const frontmatter: Record<string, string> = { project_phase: `"${phase}"` };
  if (extra) Object.assign(frontmatter, extra);
  const lines = ["---"];
  for (const [k, v] of Object.entries(frontmatter)) lines.push(`${k}: ${v}`);
  lines.push("---", "", "# Status");
  writeFileSync(join(dir, "status.md"), lines.join("\n"));
}

describe("mirror: fs.watch detects status.md changes", () => {
  let dir: string;
  let forgeDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-fswatch-test-"));
    forgeDir = join(dir, "tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("readForgeState reflects updated phase after write", async () => {
    writeStatus(forgeDir, "idle");
    const before = readForgeState(forgeDir);
    expect(before.phase).toBe("idle");

    writeStatus(forgeDir, "build");
    const after = readForgeState(forgeDir);
    expect(after.phase).toBe("build");
  });

  it("emitCommands produces set_status on phase change", async () => {
    writeStatus(forgeDir, "idle");
    const prev = readForgeState(forgeDir);

    writeStatus(forgeDir, "build");
    const next = readForgeState(forgeDir);

    const cmds = emitCommands(prev, next);
    const setStatus = cmds.find((c) => c.method === "set_status");
    expect(setStatus).toBeDefined();
    expect(setStatus?.params).toMatchObject({ text: "Forge: build" });
  });

  it("emitCommands produces sidebar_state on state change", async () => {
    writeStatus(forgeDir, "idle", { current_task: "test-task" });
    const prev = readForgeState(forgeDir);

    writeStatus(forgeDir, "review", { current_task: "test-task" });
    const next = readForgeState(forgeDir);

    const cmds = emitCommands(prev, next);
    const sidebar = cmds.find((c) => c.method === "sidebar_state");
    expect(sidebar).toBeDefined();
  });

  it("no commands emitted when state is unchanged", async () => {
    writeStatus(forgeDir, "build");
    const state = readForgeState(forgeDir);
    const cmds = emitCommands(state, state);
    expect(cmds.length).toBe(0);
  });

  it("polling daemon picks up phase transition end-to-end", async () => {
    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const { __setCapabilitiesForTest } = await import(
      "../../scripts/cmux-mirror/lib/capabilities.mjs"
    );

    // Seed capabilities so dispatchCommands can attempt to run
    __setCapabilitiesForTest(["set_status", "set_progress", "sidebar_state"]);

    writeStatus(forgeDir, "idle");

    const result = (await createMirrorDaemon({
      forgeDir,
      socketDir: dir,
      cmuxAvailable: true,
      forcePolling: true,
      pollIntervalMs: 50,
    })) as MirrorDaemonStartResult;

    expect(result.started).toBe(true);

    try {
      // Change phase — polling should read the new state
      writeStatus(forgeDir, "decide");

      // Poll readForgeState until phase flips (confirms daemon would see it)
      const state = await waitFor(
        () => {
          const s = readForgeState(forgeDir);
          return s.phase === "decide" ? s : null;
        },
        { timeoutMs: 2000, intervalMs: 50 },
      );
      expect(state.phase).toBe("decide");
    } finally {
      if (result.started) await result.shutdown();
    }
  });
});
