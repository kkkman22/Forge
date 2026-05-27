/**
 * Spec gap fixes — covers four AC items previously missing from production wiring:
 *
 *   R2.6  L3 path writes blocked stub into audit zone + status.md phase = <sub>-blocked
 *   R2.8  L1 fallback after L0 failure receives precursor_partial cross-reference
 *   R4.8  forge-loop-cli wires hookCheckPath into createAuditWriter
 *   R12.7 RateLimitDegrader appendToolHealth uses O_EXCL advisory lock
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitDegrader } from "../src/rate-limit-degrader.js";
import {
  type DispatchContext,
  dispatch,
  writeBlockedAuditRecord,
} from "../src/workflow-dispatcher.js";

let tmpRoot: string;
let forgeRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `spec-gap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  forgeRoot = join(tmpRoot, ".forge");
  mkdirSync(forgeRoot, { recursive: true });
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeCtx(overrides: Partial<DispatchContext> = {}): DispatchContext {
  return {
    subcommand: "review",
    runId: "run-001",
    sessionId: "sess-001",
    mode: "interactive",
    forgeRoot,
    pluginRoot: tmpRoot,
    ...overrides,
  };
}

/**
 * Set up a fake plugin root with workflows/ that passes probeL0Eligibility,
 * so we can exercise the L0 → catch → L1 fallback path with precursor_partial.
 */
function seedL0Eligible(): { restoreEnv: () => void } {
  const wfDir = join(tmpRoot, "workflows", "lib");
  mkdirSync(wfDir, { recursive: true });
  writeFileSync(
    join(tmpRoot, "workflows", "review.js"),
    "import { chunkedParallel } from './lib/concurrency.js';\nexport const meta = { version: '1.0.0' };\n",
    "utf-8",
  );
  writeFileSync(
    join(tmpRoot, "workflows", "lib", "concurrency.js"),
    "export const chunkedParallel = () => {};\n",
    "utf-8",
  );
  const prev = process.env.CLAUDE_CODE_WORKFLOWS;
  process.env.CLAUDE_CODE_WORKFLOWS = "1";
  return {
    restoreEnv: () => {
      if (prev === undefined) delete process.env.CLAUDE_CODE_WORKFLOWS;
      else process.env.CLAUDE_CODE_WORKFLOWS = prev;
    },
  };
}

describe("R2.6 — L3 blocked stub writes (workflow-dispatcher)", () => {
  it("writeBlockedAuditRecord writes review stub with required markers", () => {
    const dest = writeBlockedAuditRecord(forgeRoot, "review", "my-topic", "run-x");
    expect(dest.endsWith("/reviews/my-topic.md")).toBe(true);
    const content = readFileSync(dest, "utf-8");
    expect(content).toContain("result: blocked");
    expect(content).toContain("methodology: unavailable");
    expect(content).toContain("dispatch.jsonl");
  });

  it("writeBlockedAuditRecord routes decide to decisions/ and learn to knowledge/sessions/", () => {
    const decideDest = writeBlockedAuditRecord(forgeRoot, "decide", "auth-approach", "run-y");
    expect(decideDest).toContain("/decisions/");

    const learnDest = writeBlockedAuditRecord(forgeRoot, "learn", "lesson-x", "run-z");
    expect(learnDest).toContain("/knowledge/sessions/");
  });

  it("dispatch L3 path writes blocked stub + status.md phase = review-blocked", async () => {
    const result = await dispatch(makeCtx(), {
      allFallbacksFailed: true,
      topic: "blocked-topic",
    });
    expect(result.chosenLevel).toBe("L3");

    const reviewPath = join(forgeRoot, "reviews", "blocked-topic.md");
    expect(existsSync(reviewPath)).toBe(true);
    expect(readFileSync(reviewPath, "utf-8")).toContain("result: blocked");

    const statusPath = join(forgeRoot, "status.md");
    expect(existsSync(statusPath)).toBe(true);
    expect(readFileSync(statusPath, "utf-8")).toContain("phase: review-blocked");
  });

  it("dispatch non-L3 path does NOT overwrite phase field", async () => {
    // Pre-seed status.md with an existing phase
    writeFileSync(join(forgeRoot, "status.md"), "---\nphase: build-running\n---\n", "utf-8");

    await dispatch(makeCtx(), {
      tryL0: async () => ({ output: "ok" }),
      topic: "happy-topic",
    });

    const status = readFileSync(join(forgeRoot, "status.md"), "utf-8");
    // Existing phase preserved (no overwrite when L0 success)
    expect(status).toContain("phase: build-running");
  });
});

describe("R2.8 — precursor_partial cross-reference", () => {
  it("L1 fallback after L0 failure receives precursor_partial path", async () => {
    const env = seedL0Eligible();
    try {
      let receivedExtras: { precursorPartial?: string } | undefined;

      const result = await dispatch(makeCtx(), {
        tryL0: async () => {
          throw new Error("subprocess crash");
        },
        runFallback: async (_ctx, extras) => {
          receivedExtras = extras;
          return { output: "L1 result", methodology: "workflow-then-subagent" };
        },
        topic: "crash-topic",
      });

      expect(result.chosenLevel).toBe("L1");
      expect(receivedExtras?.precursorPartial).toBeDefined();
      expect(receivedExtras?.precursorPartial).toMatch(/l0-partial\/review-/);
      expect(existsSync(receivedExtras?.precursorPartial ?? "")).toBe(true);
    } finally {
      env.restoreEnv();
    }
  });

  it("dispatch payload includes precursor_partial when fallback omits it", async () => {
    const env = seedL0Eligible();
    try {
      // Sanity check: probe should pass with the seeded plugin root
      const { probeL0Eligibility } = await import("../src/workflow-dispatcher.js");
      const probeResult = probeL0Eligibility(makeCtx());
      expect(probeResult.eligible, `probe failed: ${probeResult.reason}`).toBe(true);

      let l0Called = false;
      const result = await dispatch(makeCtx(), {
        tryL0: async () => {
          l0Called = true;
          throw new Error("schema validation failed");
        },
        // runFallback returns no precursor_partial → dispatcher should backfill
        runFallback: async () => ({ output: "L1 result", methodology: "workflow-then-subagent" }),
        topic: "schema-topic",
      });

      expect(l0Called, "L0 must run before fallback").toBe(true);
      expect(result.chosenLevel).toBe("L1");
      expect(result.l0FailureSignature).toBe("schema_validation_failed");
      const payload = result.payload as Record<string, unknown> | null;
      expect(payload).not.toBeNull();
      expect(payload?.precursor_partial).toMatch(/l0-partial\/review-/);
    } finally {
      env.restoreEnv();
    }
  });
});

describe("R12.7 — tool-health.md advisory lock concurrency", () => {
  it("concurrent appendToolHealth across 5 instances produces 5 well-formed lines", async () => {
    const toolHealthPath = join(forgeRoot, "knowledge", "tool-health.md");

    const degraders = Array.from(
      { length: 5 },
      (_, i) => new RateLimitDegrader(6, toolHealthPath, `sub-${i}`),
    );

    // Trigger all 5 in parallel — each writes one line via on429()
    await Promise.all(degraders.map((d) => Promise.resolve().then(() => d.on429())));

    expect(existsSync(toolHealthPath)).toBe(true);
    const content = readFileSync(toolHealthPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.length > 0);

    // All 5 writes should land
    expect(lines.length).toBe(5);

    // Each line must match the format: <ts> · <sub> · 429-degrade · old=N new=M probe=...
    for (const line of lines) {
      expect(line).toMatch(/^[\d-]+T[\d:.]+Z · sub-\d · 429-degrade · old=6 new=3 probe=none$/);
    }

    // Lock file must not be left behind
    expect(existsSync(`${toolHealthPath}.lock`)).toBe(false);
  });

  it("lock file is cleaned up even when append fails", async () => {
    // Point at a path whose parent does not exist after mkdir attempt
    // Simulate by passing a directory path instead of file path
    const badPath = join(forgeRoot, "definitely-a-dir");
    mkdirSync(badPath, { recursive: true });

    const degrader = new RateLimitDegrader(6, badPath, "test");
    // Should not throw
    expect(() => degrader.on429()).not.toThrow();

    // Lock file must not be left behind
    expect(existsSync(`${badPath}.lock`)).toBe(false);
  });
});

describe("R4.8 — hookCheckPath wired into createAuditWriter", () => {
  it("createAuditWriter forwards hookCheckPath to WorkflowAuditWriter", async () => {
    const { createAuditWriter } = await import("../src/workflow-audit-factory.js");
    const fakeHookPath = "/path/to/hook-check-frozen.sh";
    const writer = createAuditWriter(forgeRoot, fakeHookPath);

    // Reflectively peek at private field — non-intrusive validation
    const internal = writer as unknown as { hookCheckPath?: string };
    expect(internal.hookCheckPath).toBe(fakeHookPath);
  });

  it("createAuditWriter without hookCheckPath leaves field undefined (back-compat)", async () => {
    const { createAuditWriter } = await import("../src/workflow-audit-factory.js");
    const writer = createAuditWriter(forgeRoot);
    const internal = writer as unknown as { hookCheckPath?: string };
    expect(internal.hookCheckPath).toBeUndefined();
  });
});
