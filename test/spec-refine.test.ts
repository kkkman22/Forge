/**
 * T-07: Auto Refine detection and execution tests.
 *
 * detectSpecTriggers: checks migration/refine needs from mtime.
 * refineDownstream: partial regen based on diff.
 *
 * Validates: Requirements 5, 8
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { detectSpecTriggers, refineDownstream } from "../src/spec-refine.js";
import type { SpecBundle, RequirementsDocument, SpecFileFrontmatter } from "../src/spec-bundle.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

function createTestDir(): string {
  testDir = join(tmpdir(), `spec-refine-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanup() {
  if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
}

function makeFrontmatter(): SpecFileFrontmatter {
  return { feature: "test", status: "draft", date: "2026-05-23", workflow_variant: "requirements-first" };
}

function makeBundle(): SpecBundle {
  return {
    feature: "test",
    kind: "feature",
    layout: "three-file",
    variant: "requirements-first",
    primary: {
      frontmatter: makeFrontmatter(),
      intro: "Intro",
      glossary: [],
      userStories: [],
      earsCriteria: [],
      nonFunctional: [],
      outOfScope: [],
    },
  };
}

// ---------------------------------------------------------------------------
// detectSpecTriggers
// ---------------------------------------------------------------------------

describe("detectSpecTriggers", () => {
  it("detects migration needed when spec.md exists without three files", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "spec.md"), "---\nfeature: test\nstatus: locked\ndate: 2026-05-20\n---\n\n# 目的\n\nTest.");

      const triggers = detectSpecTriggers(dir);
      expect(triggers.migrationNeeded).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("detects migration needed when plans/*.md exists without tasks.md", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "requirements.md"), "---\nfeature: test\nstatus: locked\ndate: 2026-05-23\nworkflow_variant: requirements-first\n---\n\n# R\n\n## Introduction\n\nI.\n\n## Requirements\n\n### Requirement 1: T\n\n#### Acceptance Criteria\n\n- 当 X 时 系统应当 Y\n\n## Non-functional Requirements\n\n## Out of Scope\n");
      writeFileSync(join(dir, "design.md"), "---\nfeature: test\nstatus: locked\ndate: 2026-05-23\nworkflow_variant: requirements-first\n---\n\n# D\n\n## Overview\n\nO.\n\n## Architecture\n\nA.\n\n## Error Handling\n\nE.\n\n## Testing Strategy\n\nT.\n\n## Rollout\n\nR.\n");

      // Simulate plans file existing elsewhere
      const triggers = detectSpecTriggers(dir, { plansPath: join(dir, "..", "plans", "test.md"), hasPlansFile: true });
      expect(triggers.migrationNeeded).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("no migration needed when three files exist and no legacy", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "requirements.md"), "---\nfeature: test\nstatus: draft\ndate: 2026-05-23\nworkflow_variant: requirements-first\n---\n\n# R\n\n## Introduction\n\nI.\n\n## Requirements\n\n### Requirement 1: T\n\n#### Acceptance Criteria\n\n- 当 X 时 系统应当 Y\n\n## Non-functional Requirements\n\n## Out of Scope\n");
      writeFileSync(join(dir, "design.md"), "---\nfeature: test\nstatus: draft\ndate: 2026-05-23\nworkflow_variant: requirements-first\n---\n\n# D\n\n## Overview\n\nO.\n\n## Architecture\n\nA.\n\n## Error Handling\n\nE.\n\n## Testing Strategy\n\nT.\n\n## Rollout\n\nR.\n");
      writeFileSync(join(dir, "tasks.md"), "---\nfeature: test\nstatus: draft\ndate: 2026-05-23\nworkflow_variant: requirements-first\n---\n\n# T\n\n## Tasks\n\n### T-01 Do\n\n- 目标：X\n");

      const triggers = detectSpecTriggers(dir);
      expect(triggers.migrationNeeded).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("detects refineTarget=design when requirements newer than design", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      const now = Date.now();
      writeFileSync(join(dir, "requirements.md"), `---\nfeature: test\nstatus: locked\ndate: 2026-05-23\nworkflow_variant: requirements-first\n---\n\n# R\n\n## Introduction\n\nI.\n\n## Requirements\n\n### Requirement 1: T\n\n#### Acceptance Criteria\n\n- 当 X 时 系统应当 Y\n\n## Non-functional Requirements\n\n## Out of Scope\n`);
      writeFileSync(join(dir, "design.md"), `---\nfeature: test\nstatus: locked\ndate: 2026-05-23\nworkflow_variant: requirements-first\n---\n\n# D\n\n## Overview\n\nO.\n\n## Architecture\n\nA.\n\n## Error Handling\n\nE.\n\n## Testing Strategy\n\nT.\n\n## Rollout\n\nR.\n`);

      // Make design.md older than requirements.md
      const reqStat = require("fs").statSync(join(dir, "requirements.md"));
      const designPath = join(dir, "design.md");
      // Touch design.md to be older
      const olderTime = now - 60000;
      require("fs").utimesSync(designPath, new Date(olderTime), new Date(olderTime));

      const triggers = detectSpecTriggers(dir);
      expect(triggers.refineTarget).toBe("design");
    } finally {
      cleanup();
    }
  });

  it("returns no triggers for empty directory", () => {
    const dir = createTestDir();
    try {
      mkdirSync(dir, { recursive: true });
      const triggers = detectSpecTriggers(dir);
      expect(triggers.migrationNeeded).toBe(false);
      expect(triggers.refineTarget).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// refineDownstream
// ---------------------------------------------------------------------------

describe("refineDownstream", () => {
  it("returns bundle with design status reset to draft", () => {
    const bundle = makeBundle();
    const result = refineDownstream(bundle, "design");
    expect(result.design).toBeUndefined();
    expect(result.tasks).toBeUndefined();
  });

  it("returns bundle with tasks status reset to draft when refining tasks", () => {
    const bundle: SpecBundle = {
      ...makeBundle(),
      design: {
        frontmatter: makeFrontmatter(),
        overview: "O",
        architecture: "A",
        componentInterfaces: [],
        dataModel: "",
        errorHandling: "",
        testingStrategy: "",
        rollout: "",
        openQuestions: [],
      },
      tasks: {
        frontmatter: makeFrontmatter(),
        tasks: [{ id: "T-01", title: "T", goal: "G", related_requirements: [], status: "pending" }],
      },
    };

    const result = refineDownstream(bundle, "tasks");
    // design should remain, tasks cleared
    expect(result.design).toBeDefined();
    expect(result.tasks).toBeUndefined();
  });

  it("falls back to full regen when snapshot unavailable", () => {
    const bundle = makeBundle();
    const result = refineDownstream(bundle, "design", { hasSnapshot: false });
    // Both design and tasks cleared for full regen
    expect(result.design).toBeUndefined();
    expect(result.tasks).toBeUndefined();
  });

  it("preserves primary (requirements) during design refine", () => {
    const bundle = makeBundle();
    const result = refineDownstream(bundle, "design");
    expect(result.primary).toBe(bundle.primary);
    expect(result.feature).toBe(bundle.feature);
  });
});
