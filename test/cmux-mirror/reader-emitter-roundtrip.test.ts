import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitCommands } from "../../scripts/cmux-mirror/lib/emitter.mjs";
import { readForgeState } from "../../scripts/cmux-mirror/lib/reader.mjs";

describe("reader: reads .tinkerman/ state (R2.1, R2.2)", () => {
  let forgeDir: string;

  beforeEach(() => {
    forgeDir = mkdtempSync(join(tmpdir(), "cmux-reader-test-"));
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
    mkdirSync(join(forgeDir, "reviews"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(forgeDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("reads status.md with phase and tier (R2.1)", () => {
    writeFileSync(
      join(forgeDir, "status.md"),
      [
        "---",
        'current_task: "user-pagination"',
        'tier: "standard"',
        'project_phase: "build"',
        "phase: approved",
        "updated: 2026-05-08",
        "---",
        "",
        "# Status",
        "",
        "user-pagination",
      ].join("\n"),
    );

    const state = readForgeState(forgeDir);
    expect(state.phase).toBe("build");
    expect(state.tier).toBe("standard");
    expect(state.task).toBe("user-pagination");
  });

  it("reads progress from progress file (R3.2)", () => {
    writeFileSync(
      join(forgeDir, "status.md"),
      [
        "---",
        'current_task: "user-pagination"',
        'tier: "standard"',
        'project_phase: "build"',
        "phase: approved",
        "---",
        "",
        "# Status",
      ].join("\n"),
    );

    mkdirSync(join(forgeDir, "progress"), { recursive: true });
    writeFileSync(
      join(forgeDir, "progress", "user-pagination.md"),
      [
        "---",
        'topic: "user-pagination"',
        "---",
        "",
        "| Task | Status |",
        "|------|--------|",
        "| T1 | done |",
        "| T2 | done |",
        "| T3 | in_progress |",
        "| T4 | pending |",
      ].join("\n"),
    );

    const state = readForgeState(forgeDir);
    expect(state.progress).toBeDefined();
    expect(state.progress.total).toBe(4);
    expect(state.progress.done).toBe(2);
    expect(state.progress.in_progress).toBe(1);
    expect(state.progress.pending).toBe(1);
  });

  it("reads review state (R4.2)", () => {
    writeFileSync(
      join(forgeDir, "status.md"),
      [
        "---",
        'current_task: "user-pagination"',
        'tier: "standard"',
        'project_phase: "review"',
        "phase: approved",
        "---",
        "",
        "# Status",
      ].join("\n"),
    );

    mkdirSync(join(forgeDir, "reviews"), { recursive: true });
    writeFileSync(
      join(forgeDir, "reviews", "user-pagination.md"),
      [
        "---",
        "layers_status:",
        "  spec_check: done",
        "  quality_check: pending",
        "  security_check: done",
        "completed_at:",
        "---",
        "",
        "# Review",
      ].join("\n"),
    );

    const state = readForgeState(forgeDir);
    expect(state.review).toBeDefined();
    expect(state.review?.completed).toBe(false);
    expect(state.review?.layers).toEqual({
      spec_check: "done",
      quality_check: "pending",
      security_check: "done",
    });
  });

  it("returns safe defaults for missing files (R13.5)", () => {
    const state = readForgeState(forgeDir);
    expect(state.phase).toBe("unknown");
    expect(state.tier).toBeNull();
    expect(state.task).toBeNull();
    expect(state.progress).toEqual({ total: 0, done: 0, in_progress: 0, pending: 0 });
    expect(state.review).toBeNull();
  });
});

describe("emitter: generates cmux CLI commands (R2.1, R12.10)", () => {
  it("emits set_status for phase change", () => {
    const prev = { phase: "build", tier: "standard", task: "x", progress: null, review: null };
    const next = { phase: "review", tier: "standard", task: "x", progress: null, review: null };
    const cmds = emitCommands(prev, next);
    const setStatus = cmds.find((c) => c.method === "set_status");
    expect(setStatus).toBeDefined();
    expect(setStatus?.params).toHaveProperty("text");
  });

  it("emits set_progress for progress change", () => {
    const prev = {
      phase: "build",
      tier: "standard",
      task: "x",
      progress: { total: 4, done: 2, in_progress: 0, pending: 2 },
      review: null,
    };
    const next = {
      phase: "build",
      tier: "standard",
      task: "x",
      progress: { total: 4, done: 3, in_progress: 0, pending: 1 },
      review: null,
    };
    const cmds = emitCommands(prev, next);
    const setProgress = cmds.find((c) => c.method === "set_progress");
    expect(setProgress).toBeDefined();
    expect(setProgress?.params).toHaveProperty("percent");
  });

  it("emits notification for review completion", () => {
    const prev = {
      phase: "review",
      tier: "standard",
      task: "x",
      progress: null,
      review: { completed: false, layers: { spec_check: "done", quality_check: "pending" } },
    };
    const next = {
      phase: "review",
      tier: "standard",
      task: "x",
      progress: null,
      review: { completed: true, layers: { spec_check: "done", quality_check: "done" } },
    };
    const cmds = emitCommands(prev, next);
    const notify = cmds.find((c) => c.method === "notification.create");
    expect(notify).toBeDefined();
  });

  it("emits sidebar_state with full payload (R12.10)", () => {
    const prev = {
      phase: "unknown",
      tier: null,
      task: null,
      progress: null,
      review: null,
    };
    const next = {
      phase: "build",
      tier: "standard",
      task: "my-task",
      progress: { total: 4, done: 1, in_progress: 1, pending: 2 },
      review: null,
    };
    const cmds = emitCommands(prev, next);
    const sidebar = cmds.find((c) => c.method === "sidebar_state");
    expect(sidebar).toBeDefined();
    expect(sidebar?.params).toHaveProperty("items");
  });

  it("no commands emitted when state unchanged", () => {
    const state = {
      phase: "build",
      tier: "standard",
      task: "x",
      progress: { total: 4, done: 2, in_progress: 0, pending: 2 },
      review: null,
    };
    const cmds = emitCommands(state, state);
    expect(cmds.length).toBe(0);
  });
});

describe("reader-emitter roundtrip (R2.1, R2.2)", () => {
  let forgeDir: string;

  beforeEach(() => {
    forgeDir = mkdtempSync(join(tmpdir(), "cmux-roundtrip-test-"));
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(forgeDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("full roundtrip: .tinkerman/ → state → commands", () => {
    writeFileSync(
      join(forgeDir, "status.md"),
      [
        "---",
        'current_task: "task-1"',
        'tier: "standard"',
        'project_phase: "build"',
        "phase: approved",
        "---",
        "",
        "# Status",
      ].join("\n"),
    );
    writeFileSync(
      join(forgeDir, "progress", "task-1.md"),
      [
        "---",
        'topic: "task-1"',
        "---",
        "",
        "| Task | Status |",
        "|------|--------|",
        "| T1 | done |",
        "| T2 | in_progress |",
      ].join("\n"),
    );

    const state = readForgeState(forgeDir);
    expect(state.phase).toBe("build");

    const empty = { phase: "unknown", tier: null, task: null, progress: null, review: null };
    const cmds = emitCommands(empty, state);
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds.some((c) => c.method === "set_status")).toBe(true);
    expect(cmds.some((c) => c.method === "set_progress")).toBe(true);
    expect(cmds.some((c) => c.method === "sidebar_state")).toBe(true);
  });
});
