/**
 * T1-1: Async spec-bundle-io tests — validates async migration.
 *
 * These tests call the async versions of loadSpecBundle / writeSpecBundle
 * to verify the fs.promises migration works correctly.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecBundle, writeSpecBundle } from "../src/spec-bundle-io.js";
let testDir;
function createTestDir() {
    testDir = join(tmpdir(), `spec-bundle-async-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    return testDir;
}
function cleanup() {
    if (testDir && existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
    }
}
function writeThreeFileFeature(dir, feature) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "requirements.md"), [
        "---",
        `feature: ${feature}`,
        "status: draft",
        "date: 2026-05-23",
        "workflow_variant: requirements-first",
        "---",
        "",
        "# Requirements",
        "",
        "## Introduction",
        "",
        "Test intro.",
        "",
        "## Requirements",
        "",
        "### Requirement 1: Test",
        "",
        "#### Acceptance Criteria",
        "",
        "- 当 X 时 系统应当 Y",
        "",
        "## Non-functional Requirements",
        "",
        "## Out of Scope",
        "",
        "- nothing",
    ].join("\n"));
    writeFileSync(join(dir, "design.md"), [
        "---",
        `feature: ${feature}`,
        "status: draft",
        "date: 2026-05-23",
        "workflow_variant: requirements-first",
        "---",
        "",
        "# Design",
        "",
        "## Overview",
        "",
        "Overview text.",
        "",
        "## Architecture",
        "",
        "Arch text.",
        "",
        "## Error Handling",
        "",
        "Error text.",
        "",
        "## Testing Strategy",
        "",
        "Testing text.",
        "",
        "## Rollout",
        "",
        "Rollout text.",
    ].join("\n"));
}
describe("loadSpecBundle (async)", () => {
    it("returns three-file bundle asynchronously", async () => {
        const dir = createTestDir();
        try {
            const featureDir = join(dir, "async-feature");
            writeThreeFileFeature(featureDir, "async-feature");
            const bundle = await loadSpecBundle(featureDir);
            expect(bundle.layout).toBe("three-file");
            expect(bundle.feature).toBe("async-feature");
            expect(bundle.primary).toBeDefined();
            expect(bundle.design).toBeDefined();
        }
        finally {
            cleanup();
        }
    });
    it("returns legacy-single bundle asynchronously", async () => {
        const dir = createTestDir();
        try {
            const featureDir = join(dir, "legacy-async");
            mkdirSync(featureDir, { recursive: true });
            writeFileSync(join(featureDir, "spec.md"), [
                "---",
                "feature: legacy-async",
                "status: locked",
                "date: 2026-05-20",
                "---",
                "",
                "# 目的",
                "",
                "Test purpose.",
                "",
                "## 需求",
                "",
                "### 需求 1: Test",
                "",
                "- 当 X 则 Y",
            ].join("\n"));
            const bundle = await loadSpecBundle(featureDir);
            expect(bundle.layout).toBe("legacy-single");
            expect(bundle.feature).toBe("legacy-async");
        }
        finally {
            cleanup();
        }
    });
});
describe("writeSpecBundle (async)", () => {
    it("writes three files asynchronously", async () => {
        const dir = createTestDir();
        try {
            const featureDir = join(dir, "write-async");
            mkdirSync(featureDir, { recursive: true });
            await writeSpecBundle({
                feature: "write-async",
                kind: "feature",
                layout: "three-file",
                variant: "requirements-first",
                primary: {
                    frontmatter: {
                        feature: "write-async",
                        status: "draft",
                        date: "2026-05-23",
                        workflow_variant: "requirements-first",
                    },
                    intro: "Test intro.",
                    glossary: [],
                    userStories: [],
                    earsCriteria: [],
                    nonFunctional: [],
                    outOfScope: [],
                },
            }, featureDir);
            expect(existsSync(join(featureDir, "requirements.md"))).toBe(true);
        }
        finally {
            cleanup();
        }
    });
});
//# sourceMappingURL=spec-bundle-io-async.test.js.map