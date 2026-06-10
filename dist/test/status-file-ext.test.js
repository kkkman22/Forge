/**
 * Unit tests for status-file-ext.ts — StatusFile Loop extension fields.
 *
 * Tests core functionality: extractLoopFields, writeLoopFields,
 * clearLoopFields, updateIterationStatus.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
 */
import { describe, expect, it } from "vitest";
import { clearExecutionMetadata, clearLoopFields, collectExecutionMetadataFromEnv, extractExecutionMetadata, extractLoopFields, updateIterationStatus, writeExecutionMetadata, writeLoopFields, } from "../src/status-file-ext.js";
// ---------------------------------------------------------------------------
// extractLoopFields
// ---------------------------------------------------------------------------
describe("extractLoopFields", () => {
    it("extracts all Loop fields from valid frontmatter", () => {
        const content = `---
current_task: "some task"
tier: "standard"
phase: "build"
mode: "autonomous"
loop_run_id: "a1b2c3d4"
loop_iteration: 3
skill_sequence: "plan,build,review,test,ship"
work_nature: "refactor"
---
body content
`;
        const fields = extractLoopFields(content);
        expect(fields.mode).toBe("autonomous");
        expect(fields.loopRunId).toBe("a1b2c3d4");
        expect(fields.loopIteration).toBe(3);
        expect(fields.skillSequence).toEqual(["plan", "build", "review", "test", "ship"]);
        expect(fields.workNature).toBe("refactor");
    });
    it("returns empty object for content without frontmatter", () => {
        const fields = extractLoopFields("just plain text");
        expect(fields.mode).toBeUndefined();
        expect(fields.loopRunId).toBeUndefined();
        expect(fields.loopIteration).toBeUndefined();
        expect(fields.skillSequence).toBeUndefined();
    });
    it("returns empty object for empty string", () => {
        const fields = extractLoopFields("");
        expect(fields.mode).toBeUndefined();
        expect(fields.loopRunId).toBeUndefined();
        expect(fields.loopIteration).toBeUndefined();
        expect(fields.skillSequence).toBeUndefined();
    });
    it("returns undefined for missing Loop fields in valid frontmatter", () => {
        const content = `---
current_task: "some task"
tier: "standard"
---
body
`;
        const fields = extractLoopFields(content);
        expect(fields.mode).toBeUndefined();
        expect(fields.loopRunId).toBeUndefined();
        expect(fields.loopIteration).toBeUndefined();
        expect(fields.skillSequence).toBeUndefined();
    });
    it("returns undefined for invalid mode value", () => {
        const content = `---
mode: "invalid_mode"
---
`;
        const fields = extractLoopFields(content);
        expect(fields.mode).toBeUndefined();
    });
    it("extracts interactive mode", () => {
        const content = `---
mode: "interactive"
---
`;
        const fields = extractLoopFields(content);
        expect(fields.mode).toBe("interactive");
    });
    it("handles loop_iteration of 0", () => {
        const content = `---
loop_iteration: 0
---
`;
        const fields = extractLoopFields(content);
        expect(fields.loopIteration).toBe(0);
    });
    it("handles skill_sequence with spaces around commas", () => {
        const content = `---
skill_sequence: "plan, build, review"
---
`;
        const fields = extractLoopFields(content);
        expect(fields.skillSequence).toEqual(["plan", "build", "review"]);
    });
});
// ---------------------------------------------------------------------------
// writeLoopFields
// ---------------------------------------------------------------------------
describe("writeLoopFields", () => {
    it("writes all Loop fields into existing frontmatter", () => {
        const content = `---
current_task: "some task"
---
body
`;
        const result = writeLoopFields(content, {
            mode: "autonomous",
            loopRunId: "run-123",
            loopIteration: 5,
            skillSequence: ["plan", "build", "review"],
        });
        expect(result).toContain('mode: "autonomous"');
        expect(result).toContain('loop_run_id: "run-123"');
        expect(result).toContain("loop_iteration: 5");
        expect(result).toContain('skill_sequence: "plan,build,review"');
        expect(result).toContain('current_task: "some task"');
        expect(result).toContain("body");
    });
    it("updates existing Loop fields", () => {
        const content = `---
mode: "interactive"
loop_iteration: 1
---
`;
        const result = writeLoopFields(content, {
            mode: "autonomous",
            loopIteration: 2,
        });
        expect(result).toContain('mode: "autonomous"');
        expect(result).toContain("loop_iteration: 2");
        expect(result).not.toContain('"interactive"');
        expect(result).not.toContain("loop_iteration: 1");
    });
    it("creates frontmatter when missing", () => {
        const result = writeLoopFields("plain text", {
            mode: "autonomous",
            loopRunId: "abc",
        });
        expect(result).toContain("---");
        expect(result).toContain('mode: "autonomous"');
        expect(result).toContain('loop_run_id: "abc"');
        expect(result).toContain("plain text");
    });
    it("returns content unchanged when no fields provided and no frontmatter", () => {
        const content = "plain text";
        const result = writeLoopFields(content, {});
        expect(result).toBe(content);
    });
    it("preserves other fields when writing Loop fields", () => {
        const content = `---
current_task: "task"
tier: "full"
phase: "build"
---
body content here
`;
        const result = writeLoopFields(content, { mode: "autonomous" });
        expect(result).toContain('current_task: "task"');
        expect(result).toContain('tier: "full"');
        expect(result).toContain('phase: "build"');
        expect(result).toContain('mode: "autonomous"');
        expect(result).toContain("body content here");
    });
});
// ---------------------------------------------------------------------------
// clearLoopFields
// ---------------------------------------------------------------------------
describe("clearLoopFields", () => {
    it("removes all Loop fields from frontmatter", () => {
        const content = `---
current_task: "some task"
tier: "standard"
mode: "autonomous"
loop_run_id: "a1b2c3d4"
loop_iteration: 3
skill_sequence: "plan,build,review,test,ship"
---
body
`;
        const result = clearLoopFields(content);
        expect(result).not.toContain("mode:");
        expect(result).not.toContain("loop_run_id:");
        expect(result).not.toContain("loop_iteration:");
        expect(result).not.toContain("skill_sequence:");
        expect(result).toContain('current_task: "some task"');
        expect(result).toContain('tier: "standard"');
        expect(result).toContain("body");
    });
    it("returns content unchanged when no frontmatter", () => {
        const content = "plain text";
        expect(clearLoopFields(content)).toBe(content);
    });
    it("returns content unchanged when no Loop fields present", () => {
        const content = `---
current_task: "task"
tier: "standard"
---
body
`;
        const result = clearLoopFields(content);
        expect(result).toContain('current_task: "task"');
        expect(result).toContain('tier: "standard"');
    });
});
// ---------------------------------------------------------------------------
// updateIterationStatus
// ---------------------------------------------------------------------------
describe("updateIterationStatus", () => {
    it("updates phase and loop_iteration in existing frontmatter", () => {
        const content = `---
current_task: "task"
phase: "plan"
loop_iteration: 1
---
body
`;
        const result = updateIterationStatus(content, "build", 2);
        expect(result).toContain('phase: "build"');
        expect(result).toContain("loop_iteration: 2");
        expect(result).not.toContain('"plan"');
        expect(result).not.toContain("loop_iteration: 1");
        expect(result).toContain('current_task: "task"');
    });
    it("adds phase and loop_iteration when not present", () => {
        const content = `---
current_task: "task"
---
body
`;
        const result = updateIterationStatus(content, "review", 5);
        expect(result).toContain('phase: "review"');
        expect(result).toContain("loop_iteration: 5");
        expect(result).toContain('current_task: "task"');
    });
    it("creates frontmatter when missing", () => {
        const result = updateIterationStatus("plain text", "build", 1);
        expect(result).toContain("---");
        expect(result).toContain('phase: "build"');
        expect(result).toContain("loop_iteration: 1");
        expect(result).toContain("plain text");
    });
    it("handles iteration 0", () => {
        const content = `---
phase: "router"
---
`;
        const result = updateIterationStatus(content, "plan", 0);
        expect(result).toContain('phase: "plan"');
        expect(result).toContain("loop_iteration: 0");
    });
});
// ---------------------------------------------------------------------------
// work_nature in Loop fields
// ---------------------------------------------------------------------------
describe("work_nature in Loop fields", () => {
    it("extractLoopFields extracts work_nature", () => {
        const content = `---
mode: "autonomous"
loop_run_id: "run-1"
loop_iteration: 0
skill_sequence: "refactor-scan,refactor-apply,review,test,ship"
work_nature: "refactor"
---
body`;
        const fields = extractLoopFields(content);
        expect(fields.workNature).toBe("refactor");
    });
    it("extractLoopFields returns undefined for missing work_nature", () => {
        const content = `---
mode: "autonomous"
loop_run_id: "run-1"
---
body`;
        const fields = extractLoopFields(content);
        expect(fields.workNature).toBeUndefined();
    });
    it("writeLoopFields writes work_nature", () => {
        const content = `---
mode: "autonomous"
loop_run_id: "run-1"
---
body`;
        const result = writeLoopFields(content, { workNature: "bugfix" });
        expect(result).toContain('work_nature: "bugfix"');
        expect(result).toContain('mode: "autonomous"');
    });
    it("writeLoopFields creates frontmatter with work_nature when missing", () => {
        const result = writeLoopFields("plain text", { workNature: "refactor" });
        expect(result).toContain('work_nature: "refactor"');
    });
    it("clearLoopFields removes work_nature", () => {
        const content = `---
mode: "autonomous"
loop_run_id: "run-1"
work_nature: "bugfix"
---
body`;
        const result = clearLoopFields(content);
        expect(result).not.toContain("work_nature");
        // Non-loop fields preserved
        expect(result).toContain("body");
    });
});
describe("execution metadata fields", () => {
    it("roundtrips allowlisted execution metadata through status frontmatter", () => {
        const content = `---
current_task: "task"
tier: "standard"
phase: "build"
---
body
`;
        const result = writeExecutionMetadata(content, {
            claude_version: "2.1.169",
            dispatch_mode: "agents",
            diagnostic_mode: true,
            tier: "standard",
            branch: "forge/claude-2-1-169-inspired-hardening",
            forge_flags: ["FORGE_REVIEW_CONCURRENCY", "FORGE_DIAGNOSTIC_MODE"],
            recorded_at: "2026-06-09T00:00:00.000Z",
        });
        const metadata = extractExecutionMetadata(result);
        expect(metadata).toEqual({
            claude_version: "2.1.169",
            dispatch_mode: "agents",
            diagnostic_mode: true,
            tier: "standard",
            branch: "forge/claude-2-1-169-inspired-hardening",
            forge_flags: ["FORGE_REVIEW_CONCURRENCY", "FORGE_DIAGNOSTIC_MODE"],
            recorded_at: "2026-06-09T00:00:00.000Z",
        });
        expect(result).toContain("body");
    });
    it("returns defaults for older status files without metadata", () => {
        const metadata = extractExecutionMetadata(`---
current_task: "old"
tier: "standard"
---
body`);
        expect(metadata).toEqual({});
    });
    it("collects only allowlisted FORGE flags and excludes secrets", () => {
        const metadata = collectExecutionMetadataFromEnv({
            FORGE_DIAGNOSTIC_MODE: "1",
            FORGE_REVIEW_CONCURRENCY: "3",
            FORGE_API_TOKEN: "secret",
            ANTHROPIC_API_KEY: "secret",
            RANDOM_ENV: "ignored",
        });
        expect(metadata.diagnostic_mode).toBe(true);
        expect(metadata.forge_flags).toEqual(["FORGE_DIAGNOSTIC_MODE", "FORGE_REVIEW_CONCURRENCY"]);
        expect(JSON.stringify(metadata)).not.toContain("secret");
        expect(JSON.stringify(metadata)).not.toContain("ANTHROPIC_API_KEY");
    });
    it("creates frontmatter for execution metadata when missing", () => {
        const result = writeExecutionMetadata("# Status\n", {
            claude_version: "2.1.169",
            dispatch_mode: "inline",
            diagnostic_mode: false,
        });
        expect(result).toContain('execution_claude_version: "2.1.169"');
        expect(result).toContain('execution_dispatch_mode: "inline"');
        expect(result).toContain("execution_diagnostic_mode: false");
        expect(result).toContain("# Status");
        expect(extractExecutionMetadata(result)).toEqual({
            claude_version: "2.1.169",
            dispatch_mode: "inline",
            diagnostic_mode: false,
        });
    });
    it("filters invalid execution metadata values and deduplicates allowed flags", () => {
        const result = writeExecutionMetadata("---\ncurrent_task: demo\n---\nbody\n", {
            dispatch_mode: "invalid",
            tier: "oversized",
            forge_flags: [
                "FORGE_ROOT",
                "FORGE_ROOT",
                "FORGE_TOKEN",
                "RANDOM_ENV",
                "FORGE_DECIDE_DISPATCH_MODE",
            ],
        });
        expect(result).not.toContain("execution_dispatch_mode");
        expect(result).not.toContain("execution_tier");
        expect(result).not.toContain("FORGE_TOKEN");
        expect(extractExecutionMetadata(result).forge_flags).toEqual([
            "FORGE_ROOT",
            "FORGE_DECIDE_DISPATCH_MODE",
        ]);
    });
    it("clearExecutionMetadata removes only execution metadata fields", () => {
        const result = clearExecutionMetadata(`---
current_task: demo
execution_claude_version: "2.1.169"
execution_dispatch_mode: "agents"
execution_diagnostic_mode: true
execution_tier: "full"
execution_branch: "forge/demo"
execution_forge_flags: "FORGE_ROOT"
execution_recorded_at: "2026-06-09T00:00:00.000Z"
---
body`);
        expect(result).toContain("current_task: demo");
        expect(result).toContain("body");
        expect(result).not.toContain("execution_");
    });
    it("clearExecutionMetadata leaves content without frontmatter unchanged", () => {
        expect(clearExecutionMetadata("plain status")).toBe("plain status");
    });
});
//# sourceMappingURL=status-file-ext.test.js.map