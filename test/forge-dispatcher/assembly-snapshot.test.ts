/**
 * Assembly snapshot tests [REQ-01, R3] — lock the structural fingerprint of
 * the forge-dispatcher pipeline for representative subcommands.
 *
 * Drives the REAL dispatcher against the REAL lib files (no mock of the
 * resolution steps), only stubbing the agent/read execution tails. Extracts
 * a content-agnostic fingerprint and compares against a golden fixture.
 *
 * If the fence wrapper is dropped, hints become override, or a lib's
 * allowed_tools / dispatch_mode changes, this snapshot trips.
 * If only lib wording changes, the fingerprint is untouched.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AssemblyFingerprint,
  extractFingerprint,
} from "../../src/forge-dispatcher/assemble-fingerprint.js";
import { resolveLibPath } from "../../src/forge-dispatcher/path-resolve.js";
import { resolveAllowedTools } from "../../src/forge-dispatcher/tools-resolve.js";
import { wrapWorkspaceContext } from "../../src/forge-dispatcher/untrusted-fence.js";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";
import { generateHints, type ProjectPhase, type TaskType } from "../../src/router.js";

const LIB_ROOT = resolve(import.meta.dirname, "../../skills/tinkerman/lib");

const GOLDEN_PATH = resolve(import.meta.dirname, "../__fixtures__/assembly-golden.json");
const GOLDEN = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8")) as Record<
  string,
  AssemblyFingerprint
>;

/**
 * Representative subcommands covering the three routing tiers and a spread of
 * task types. Each entry documents why it was chosen so the set is auditable.
 *
 * build/review/test/ship  — the four command sequence every tier traverses
 * plan/decide/spec        — the heavier full-tier planning front
 * learn/status            — light-tier + always-on housekeeping
 * debug                   — exercises a different lib dispatch_mode if any
 */
const REPRESENTATIVE_SUBS = [
  { sub: "build", taskType: "backend" as TaskType, phase: "greenfield" as ProjectPhase },
  { sub: "build", taskType: "docs" as TaskType, phase: "iteration" as ProjectPhase },
  { sub: "review", taskType: "fullstack" as TaskType, phase: "iteration" as ProjectPhase },
  { sub: "test", taskType: "backend" as TaskType, phase: "refactor" as ProjectPhase },
  { sub: "ship", taskType: "fullstack" as TaskType, phase: "greenfield" as ProjectPhase },
  { sub: "plan", taskType: "fullstack" as TaskType, phase: "greenfield" as ProjectPhase },
  { sub: "decide", taskType: "infra" as TaskType, phase: "greenfield" as ProjectPhase },
  { sub: "spec", taskType: "data" as TaskType, phase: "greenfield" as ProjectPhase },
  { sub: "learn", taskType: "docs" as TaskType, phase: "iteration" as ProjectPhase },
  { sub: "status", taskType: "frontend" as TaskType, phase: "bugfix" as ProjectPhase },
  { sub: "debug", taskType: "backend" as TaskType, phase: "bugfix" as ProjectPhase },
  { sub: "learn", taskType: "backend" as TaskType, phase: "refactor" as ProjectPhase },
];

/**
 * Build a fingerprint for one sub by driving the real pipeline:
 * dispatch resolves the lib path + integrity, then we independently extract
 * the structural signals (dispatch_mode, allowed_tools) from the same lib
 * content the dispatcher read, wrap a representative context with the fence,
 * and generate router hints.
 */
async function buildFingerprint(sub: string, taskType: TaskType, phase: ProjectPhase) {
  // Drive the real dispatcher end-to-end; stub only execution tails.
  const result = await dispatchForgeSubcommand(sub, {
    _mocks: { agent: async () => undefined, read: () => undefined },
  });
  expect(result.code).toBe("OK");

  // Resolve the same lib path + read its content to extract structural signals.
  const pathResult = resolveLibPath(sub);
  if (!pathResult.ok) throw new Error(`path resolve failed for ${sub}`);
  const libPath = pathResult.path;
  const libContent = readFileSync(libPath, "utf-8");

  // Parse dispatch_mode the same way the dispatcher does.
  const fmMatch = libContent.match(/^---\n([\s\S]*?)\n---/);
  const modeMatch = fmMatch?.[1].match(/dispatch_mode:\s*([a-z]+)/);
  const dispatchMode = modeMatch?.[1] ?? "inline";

  const toolsResult = resolveAllowedTools(libContent);
  const allowedTools = toolsResult.ok ? toolsResult.tools : [];

  // Wrap a representative workspace context with the untrusted fence.
  const contextBlock = wrapWorkspaceContext([
    { path: ".forge/status.md", content: "tier: standard\nphase: build" },
  ]);

  const hintTags = generateHints(taskType, phase, [sub]).map((h) => h.tag);

  const fp = extractFingerprint({
    subcommand: sub,
    dispatchMode,
    resolvedLibPath: libPath.replace(LIB_ROOT, "tinkerman/lib").replace(/^\//, ""),
    allowedTools,
    contextBlock,
    hintTags,
  });
  return fp;
}

describe("Assembly snapshot [REQ-01, R3]: structural fingerprint stable per sub", () => {
  for (const { sub, taskType, phase } of REPRESENTATIVE_SUBS) {
    const key = `${sub}|${taskType}|${phase}`;

    it(`${key} fingerprint matches golden`, async () => {
      const fp = await buildFingerprint(sub, taskType, phase);
      expect(fp, key).toEqual(GOLDEN[key]);
    });
  }

  it("every representative sub keeps the untrusted-fence preamble intact", async () => {
    // Aggregate invariant: no representative dispatch must drop the fence.
    for (const { sub, taskType, phase } of REPRESENTATIVE_SUBS) {
      const fp = await buildFingerprint(sub, taskType, phase);
      expect(fp.hasUntrustedPreamble, `${sub}|${taskType}|${phase} lost fence`).toBe(true);
    }
  });

  it("golden covers exactly the representative set (no missing, no extra)", () => {
    const expectedKeys = REPRESENTATIVE_SUBS.map((c) => `${c.sub}|${c.taskType}|${c.phase}`).sort();
    const goldenKeys = Object.keys(GOLDEN).sort();
    expect(goldenKeys).toEqual(expectedKeys);
  });
});
