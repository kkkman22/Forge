/**
 * Zero-Pack-Zero-Impact invariant regression tests.
 *
 * When no packs are enabled, all pack subsystems must return empty results
 * and no behavior should change from pre-pack Forge.
 *
 * **Validates**: R12 Zero-Pack-Zero-Impact invariant
 */

import { describe, expect, it } from "vitest";
import { shouldBlockShip } from "../../src/accept-gate.js";
import { runMicroReview } from "../../src/build-micro-review.js";
import { loadContextMap } from "../../src/context/map.js";
import { loadContexts } from "../../src/context/registry.js";
import { loadGlossary } from "../../src/glossary/registry.js";
import { collectTargetGlobs } from "../../src/mutate.js";
import { parseEnabledPacks } from "../../src/pack/config.js";
import { loadPackRegistry } from "../../src/pack/loader.js";
import { resolveAllPaths, resolvePath } from "../../src/pack/resolver.js";
import type { EnabledPacks, FileSystem } from "../../src/pack/types.js";
import { loadBannedPatterns } from "../../src/spec-leak-detector.js";
import { loadStateMachineDefinition, validateDefinition } from "../../src/state-machine/index.js";

const emptyFs: FileSystem = {
  readdir: async () => [],
  readFile: async () => {
    throw new Error("no files");
  },
  writeFile: async () => {},
  exists: async () => false,
  stat: async () => ({ isFile: () => false, isDirectory: () => false }),
};

const emptyEnabled: EnabledPacks = {
  order: [],
  entries: [],
  customLayerRoot: "/project/.tinkerman/custom",
};

describe("Zero-Pack-Zero-Impact invariant", () => {
  it("loadPackRegistry returns empty registry when no packs directory", async () => {
    const registry = await loadPackRegistry("/nonexistent", emptyFs);
    expect(registry.packs.size).toBe(0);
    expect(registry.warnings).toEqual([]);
  });

  it("parseEnabledPacks returns empty with no packs config", () => {
    const result = parseEnabledPacks("", { packs: new Map(), warnings: [] }, "/custom");
    expect(result.enabled.order).toEqual([]);
    expect(result.enabled.entries).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("resolvePath resolves only to custom layer (no pack layers)", () => {
    const result = resolvePath("glossary/orders.md", emptyEnabled);
    // Custom layer always exists as fallback — but no pack layers
    expect(result).not.toBeNull();
    expect(result?.layer).toBe("custom");
  });

  it("resolveAllPaths returns only custom layer for empty enabled packs", () => {
    const results = resolveAllPaths("glossary/orders.md", emptyEnabled);
    expect(results).toHaveLength(1);
    expect(results[0].layer).toBe("custom");
  });

  it("loadContexts returns empty registry for empty enabled packs", async () => {
    const registry = await loadContexts(emptyEnabled, emptyFs);
    expect(registry.contexts.size).toBe(0);
    expect(registry.map).toEqual([]);
  });

  it("loadContextMap returns empty for empty enabled packs", async () => {
    const map = await loadContextMap(emptyEnabled, emptyFs);
    expect(map).toEqual([]);
  });

  it("loadGlossary returns empty registry for empty enabled packs", async () => {
    const registry = await loadGlossary(emptyEnabled, emptyFs);
    expect(registry.entries.size).toBe(0);
    expect(registry.byTerm.size).toBe(0);
  });

  it("loadBannedPatterns returns empty registry for empty enabled packs", async () => {
    const registry = await loadBannedPatterns(emptyEnabled, emptyFs);
    expect(registry.categories.size).toBe(0);
  });

  // --- Sprint 2 engine invariants ---

  it("shouldBlockShip returns no-block when enabled packs empty", () => {
    const decision = shouldBlockShip({
      spec: {
        filePath: "spec.md",
        frontmatter: { context: "reservations" },
        body: "## Scenarios\n- scenario 1",
      },
      enabledPacks: emptyEnabled,
      acceptanceArtifactPath: null,
    });
    expect(decision.block).toBe(false);
    expect(decision.reason).toBeUndefined();
  });

  it("collectTargetGlobs returns empty array when no packs declare mutation_critical_modules", () => {
    const globs = collectTargetGlobs(emptyEnabled);
    expect(globs).toEqual([]);
  });

  it("runMicroReview degrades to loose mode for legacy plans", () => {
    // Legacy plan with diff and pass indicator — should pass
    const passResult = runMicroReview({
      task: { title: "legacy task" },
      gitDiff: "diff --git a/file.ts b/file.ts\n+new line",
      verifyOutput: "all tests passed",
      planVersion: "legacy",
    });
    expect(passResult.verdict).toBe("pass");
    expect(passResult.covered).toEqual([]);
    expect(passResult.missing).toEqual([]);

    // Legacy plan with empty diff — should fail
    const failResult = runMicroReview({
      task: { title: "legacy task" },
      gitDiff: "",
      verifyOutput: "PASS",
      planVersion: "legacy",
    });
    expect(failResult.verdict).toBe("needs_iteration");
    expect(failResult.missing.length).toBeGreaterThan(0);
  });

  it("state-machine engine is importable and usable without any packs", () => {
    // A minimal valid state machine definition
    const yaml = [
      "name: test-machine",
      "description: test",
      "states:",
      "  - name: Idle",
      "    description: idle state",
      "  - name: Done",
      "    terminal: true",
      "    description: done",
      "initial: Idle",
      "transitions:",
      "  - from: Idle",
      "    to: Done",
      "    event: Finish",
      "invariants:",
      "  - expression: terminal_state_has_no_outgoing_transitions",
      "    description: terminal has no outgoing",
    ].join("\n");

    const def = loadStateMachineDefinition(yaml, "test.yaml");
    expect(def.name).toBe("test-machine");
    expect(def.states).toHaveLength(2);
    expect(def.initial).toBe("Idle");

    const report = validateDefinition(def);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });
});
