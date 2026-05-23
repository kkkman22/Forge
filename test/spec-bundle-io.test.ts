/**
 * T-03: SpecBundle load/write tests — loadSpecBundle, writeSpecBundle.
 *
 * Validates: Requirement 1, 6
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecBundle, writeSpecBundle } from "../src/spec-bundle-io.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

function createTestDir(): string {
  testDir = join(tmpdir(), `spec-bundle-io-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function cleanup() {
  if (testDir && existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

function writeThreeFileFeature(dir: string, feature: string) {
  mkdirSync(dir, { recursive: true });

  writeFileSync(
    join(dir, "requirements.md"),
    `---
feature: ${feature}
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Requirements

## Introduction

Test intro.

## Requirements

### Requirement 1: Test

#### Acceptance Criteria

- 当 X 时 系统应当 Y

## Non-functional Requirements

## Out of Scope

- nothing
`,
  );

  writeFileSync(
    join(dir, "design.md"),
    `---
feature: ${feature}
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Design

## Overview

Overview text.

## Architecture

Arch text.

## Error Handling

Error text.

## Testing Strategy

Testing text.

## Rollout

Rollout text.
`,
  );

  writeFileSync(
    join(dir, "tasks.md"),
    `---
feature: ${feature}
status: draft
date: 2026-05-23
workflow_variant: requirements-first
---

# Tasks

## Tasks

### T-01 First

- 目标：Do something
`,
  );
}

function writeLegacySpec(dir: string, feature: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "spec.md"),
    `---
feature: ${feature}
status: locked
date: 2026-05-20
---

# 目的

Test purpose.

## 需求

### 需求 1: Test

- 当 X 则 Y

## 不做什么

- nothing
`,
  );
}

// ---------------------------------------------------------------------------
// loadSpecBundle
// ---------------------------------------------------------------------------

describe("loadSpecBundle", () => {
  it("returns layout=three-file when all three files exist", () => {
    const dir = createTestDir();
    try {
      const featureDir = join(dir, "my-feature");
      writeThreeFileFeature(featureDir, "my-feature");

      const bundle = loadSpecBundle(featureDir);
      expect(bundle.layout).toBe("three-file");
      expect(bundle.kind).toBe("feature");
      expect(bundle.feature).toBe("my-feature");
      expect(bundle.primary).toBeDefined();
      expect(bundle.design).toBeDefined();
      expect(bundle.tasks).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("returns layout=legacy-single when only spec.md exists", () => {
    const dir = createTestDir();
    try {
      const featureDir = join(dir, "legacy-feature");
      writeLegacySpec(featureDir, "legacy-feature");

      const bundle = loadSpecBundle(featureDir);
      expect(bundle.layout).toBe("legacy-single");
      expect(bundle.kind).toBe("feature");
      expect(bundle.feature).toBe("legacy-feature");
      expect(bundle.design).toBeUndefined();
      expect(bundle.tasks).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("returns layout=three-file with migrationHint=true when both layouts exist", () => {
    const dir = createTestDir();
    try {
      const featureDir = join(dir, "dual-feature");
      writeThreeFileFeature(featureDir, "dual-feature");
      writeLegacySpec(featureDir, "dual-feature");

      const bundle = loadSpecBundle(featureDir);
      expect(bundle.layout).toBe("three-file");
      expect((bundle as any).migrationHint).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("throws when no spec files exist", () => {
    const dir = createTestDir();
    try {
      const featureDir = join(dir, "empty-feature");
      mkdirSync(featureDir, { recursive: true });

      expect(() => loadSpecBundle(featureDir)).toThrow();
    } finally {
      cleanup();
    }
  });

  it("parses EARS clauses from three-file requirements", () => {
    const dir = createTestDir();
    try {
      const featureDir = join(dir, "ears-test");
      writeThreeFileFeature(featureDir, "ears-test");

      const bundle = loadSpecBundle(featureDir);
      // The adapter should have parsed the EARS from requirements.md
      const reqDoc = bundle.primary as any;
      expect(reqDoc.earsCriteria).toBeDefined();
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// writeSpecBundle
// ---------------------------------------------------------------------------

describe("writeSpecBundle", () => {
  it("writes three files for layout=three-file", () => {
    const dir = createTestDir();
    try {
      const featureDir = join(dir, "write-test");
      mkdirSync(featureDir, { recursive: true });

      writeSpecBundle(
        {
          feature: "write-test",
          kind: "feature",
          layout: "three-file",
          variant: "requirements-first",
          primary: {
            frontmatter: {
              feature: "write-test",
              status: "draft",
              date: "2026-05-23",
              workflow_variant: "requirements-first",
            },
            intro: "Test intro.",
            glossary: [],
            userStories: [],
            earsCriteria: [],
            nonFunctional: [],
            outOfScope: ["nothing"],
          },
          design: {
            frontmatter: {
              feature: "write-test",
              status: "draft",
              date: "2026-05-23",
              workflow_variant: "requirements-first",
            },
            overview: "Overview",
            architecture: "Arch",
            componentInterfaces: [],
            dataModel: "",
            errorHandling: "",
            testingStrategy: "",
            rollout: "",
            openQuestions: [],
          },
          tasks: {
            frontmatter: {
              feature: "write-test",
              status: "draft",
              date: "2026-05-23",
              workflow_variant: "requirements-first",
            },
            tasks: [
              {
                id: "T-01",
                title: "Test",
                goal: "Do X",
                related_requirements: [],
                status: "pending",
              },
            ],
          },
        },
        featureDir,
      );

      expect(existsSync(join(featureDir, "requirements.md"))).toBe(true);
      expect(existsSync(join(featureDir, "design.md"))).toBe(true);
      expect(existsSync(join(featureDir, "tasks.md"))).toBe(true);

      // Verify frontmatter is correct
      const reqContent = readFileSync(join(featureDir, "requirements.md"), "utf-8");
      expect(reqContent).toContain("feature: write-test");
      expect(reqContent).toContain("status: draft");
    } finally {
      cleanup();
    }
  });

  it("round-trips: load then write preserves content", () => {
    const dir = createTestDir();
    try {
      const featureDir = join(dir, "roundtrip");
      writeThreeFileFeature(featureDir, "roundtrip");

      const bundle = loadSpecBundle(featureDir);
      const outDir = join(dir, "roundtrip-out");
      mkdirSync(outDir, { recursive: true });

      writeSpecBundle(bundle, outDir);

      const bundle2 = loadSpecBundle(outDir);
      expect(bundle2.feature).toBe(bundle.feature);
      expect(bundle2.layout).toBe(bundle.layout);
      expect(bundle2.kind).toBe(bundle.kind);
    } finally {
      cleanup();
    }
  });
});
