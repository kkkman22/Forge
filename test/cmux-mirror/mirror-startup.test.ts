import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MirrorDaemonStartResult } from "./types.js";

describe("mirror: startup and availability checks (R1.5–R1.10)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-mirror-test-"));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("R1.5: startup exits early when cmux not available", async () => {
    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const result = (await createMirrorDaemon({
      forgeDir: dir,
      socketDir: dir,
      cmuxAvailable: false,
    })) as MirrorDaemonStartResult;
    expect(result.started).toBe(false);
    expect(result.reason).toBe("cmux_unavailable");
  });

  it("R1.6: startup exits early when forgeDir missing", async () => {
    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const missingDir = join(dir, "nonexistent");
    const result = (await createMirrorDaemon({
      forgeDir: missingDir,
      socketDir: dir,
      cmuxAvailable: true,
    })) as MirrorDaemonStartResult;
    expect(result.started).toBe(false);
    expect(result.reason).toBe("forge_dir_missing");
  });

  it("R1.7: startup succeeds with valid config", async () => {
    const forgeDir = join(dir, "tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
    writeFileSync(
      join(forgeDir, "status.md"),
      ["---", 'project_phase: "idle"', "---", "", "# Status"].join("\n"),
    );

    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const result = (await createMirrorDaemon({
      forgeDir,
      socketDir: dir,
      cmuxAvailable: true,
    })) as MirrorDaemonStartResult;
    expect(result.started).toBe(true);
    if (result.started) {
      await result.shutdown();
    }
  });
});

describe("mirror: debounce behavior (R1.8)", () => {
  it("rapid file changes only trigger one dispatch", async () => {
    const { createDebouncer } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const dispatched: string[] = [];
    const debounce = createDebouncer(50, (path: string) => dispatched.push(path));

    debounce.notify("status.md");
    debounce.notify("status.md");
    debounce.notify("status.md");

    await new Promise((r) => setTimeout(r, 120));
    expect(dispatched.length).toBe(1);
  });
});

describe("mirror: signal handling (R1.9)", () => {
  it("shutdown is idempotent", async () => {
    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const forgeDir = join(mkdtempSync(join(tmpdir(), "cmux-sig-test-")), "tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
    writeFileSync(join(forgeDir, "status.md"), ["---", 'project_phase: "idle"', "---"].join("\n"));

    const result = (await createMirrorDaemon({
      forgeDir,
      socketDir: join(forgeDir, ".."),
      cmuxAvailable: true,
    })) as MirrorDaemonStartResult;

    if (result.started) {
      await result.shutdown();
      // Second shutdown should not throw
      await result.shutdown();
    }

    try {
      rmSync(join(forgeDir, ".."), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
});

describe("mirror: polling fallback (R1.10)", () => {
  it("falls back to polling when fs.watch unavailable", async () => {
    const { createMirrorDaemon } = await import("../../scripts/cmux-mirror/mirror.mjs");
    const forgeDir = join(mkdtempSync(join(tmpdir(), "cmux-poll-test-")), "tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
    writeFileSync(join(forgeDir, "status.md"), ["---", 'project_phase: "build"', "---"].join("\n"));

    const result = (await createMirrorDaemon({
      forgeDir,
      socketDir: join(forgeDir, ".."),
      cmuxAvailable: true,
      forcePolling: true,
      pollIntervalMs: 50,
    })) as MirrorDaemonStartResult;

    expect(result.started).toBe(true);
    if (result.started) {
      await result.shutdown();
    }

    try {
      rmSync(join(forgeDir, ".."), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });
});
