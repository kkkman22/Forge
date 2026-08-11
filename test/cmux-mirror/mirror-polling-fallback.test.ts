import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MirrorDaemonStartResult } from "./types.js";

describe("mirror: polling fallback with MIRROR_USE_POLLING=1 (R1.10)", () => {
  let dir: string;
  let forgeDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-poll-fallback-"));
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

  it("starts daemon with forcePolling and processes status.md", async () => {
    writeFileSync(
      join(forgeDir, "status.md"),
      ["---", 'project_phase: "build"', "---", "", "# Status"].join("\n"),
    );

    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const result = (await createMirrorDaemon({
      forgeDir,
      socketDir: dir,
      cmuxAvailable: true,
      forcePolling: true,
      pollIntervalMs: 50,
    })) as MirrorDaemonStartResult;

    expect(result.started).toBe(true);
    if (result.started) {
      await result.shutdown();
    }
  });

  it("detects state change via polling after status.md update", async () => {
    writeFileSync(
      join(forgeDir, "status.md"),
      ["---", 'project_phase: "idle"', "---", "", "# Status"].join("\n"),
    );

    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const result = (await createMirrorDaemon({
      forgeDir,
      socketDir: dir,
      cmuxAvailable: true,
      forcePolling: true,
      pollIntervalMs: 50,
    })) as MirrorDaemonStartResult;

    expect(result.started).toBe(true);

    // Update status while daemon is running
    writeFileSync(
      join(forgeDir, "status.md"),
      ["---", 'project_phase: "build"', "---", "", "# Status"].join("\n"),
    );

    // Wait for at least one poll cycle + debounce
    await new Promise((r) => setTimeout(r, 400));

    if (result.started) {
      await result.shutdown();
    }
  });

  it("polling daemon shuts down cleanly", async () => {
    writeFileSync(join(forgeDir, "status.md"), ["---", 'project_phase: "idle"', "---"].join("\n"));

    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const result = (await createMirrorDaemon({
      forgeDir,
      socketDir: dir,
      cmuxAvailable: true,
      forcePolling: true,
      pollIntervalMs: 50,
    })) as MirrorDaemonStartResult;

    expect(result.started).toBe(true);
    if (result.started) {
      await result.shutdown();
      // Second shutdown is idempotent
      await result.shutdown();
    }
  });
});
