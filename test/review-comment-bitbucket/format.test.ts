import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildMarker,
  computeFindingHash,
  extractMarker,
} from "../../src/review-comment-bitbucket/finding-hash.js";
import { formatFinding } from "../../src/review-comment-bitbucket/format.js";

// Test data generators
const priorityArb = fc.constantFrom("P0", "P1", "P2", "P3");
const lineTypeArb = fc.constantFrom("ADDED", "REMOVED", "CONTEXT");
const sourceLayerArb = fc.constantFrom("spec-check", "quality-check", "security-check");

const findingArb = fc.record({
  priority: priorityArb,
  finding_type: fc.string({ minLength: 1, maxLength: 50 }),
  file_path: fc.string({ minLength: 1, maxLength: 100 }),
  line_number: fc.nat({ max: 10000 }),
  line_type: lineTypeArb,
  message: fc.string({ minLength: 100, maxLength: 500 }), // Avoid filter starvation
  suggestion: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
  suggestion_end_line: fc.option(fc.nat({ max: 10000 }), { nil: undefined }),
  source_layer: sourceLayerArb,
});

const runIdArb = fc.string({ minLength: 1, maxLength: 50 });
const prefixArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !s.includes(":") && !s.includes("="));

describe("formatFinding property tests", () => {
  it("Property 24: comment_text ends with marker, task_text ends with marker if non-empty", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(findingArb, runIdArb, prefixArb, (finding, runId, prefix) => {
        const result = formatFinding(finding, runId, prefix);

        expect(result.comment_text).toContain(result.marker);
        expect(result.comment_text.endsWith(result.marker)).toBe(true);

        if (result.task_text !== "") {
          expect(result.task_text.endsWith(result.marker)).toBe(true);
        }
      }),
    );
  });

  it("Property 25: P2 findings have empty task_text", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(findingArb, runIdArb, prefixArb, (finding, runId, prefix) => {
        const p2Finding = { ...finding, priority: "P2" as const };
        const result = formatFinding(p2Finding, runId, prefix);

        expect(result.task_text).toBe("");
      }),
    );
  });

  it("Property 26: non-empty suggestion ⇒ comment_text contains suggestion fence with exact content", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(findingArb, runIdArb, prefixArb, (finding, runId, prefix) => {
        if (!finding.suggestion) return true; // Skip if no suggestion

        const result = formatFinding(finding, runId, prefix);

        // Check for suggestion fence
        expect(result.comment_text).toContain("```suggestion");
        expect(result.comment_text).toContain(finding.suggestion);

        // The suggestion should be between the fence lines. The fence length is
        // adaptive (>= 3 backticks) — it grows when message/suggestion contain a
        // backtick run, so match the opening/closing fence by regex, not a fixed
        // 3-backtick literal (otherwise message with "```" shrinks the property).
        const fenceOpen = /^`{3,}suggestion$/;
        const fenceClose = /^`{3,}$/;
        const lines = result.comment_text.split("\n");
        let inSuggestionBlock = false;
        let foundSuggestion = false;

        for (const line of lines) {
          const trimmed = line.trim();
          if (fenceOpen.test(trimmed)) {
            inSuggestionBlock = true;
          } else if (inSuggestionBlock && fenceClose.test(trimmed)) {
            inSuggestionBlock = false;
          } else if (inSuggestionBlock && line === finding.suggestion) {
            foundSuggestion = true;
          }
        }

        expect(foundSuggestion).toBe(true);
        return true;
      }),
    );
  });

  it("Property 27: P0/P1 task_text first line has no newline and total length ≤ 200", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(findingArb, runIdArb, prefixArb, (finding, runId, prefix) => {
        if (finding.priority !== "P0" && finding.priority !== "P1") return true;

        const result = formatFinding(finding, runId, prefix);

        // First line should not contain newline
        const firstLineEnd = result.task_text.indexOf("\n");
        expect(firstLineEnd).toBe(-1); // No newline in task_text

        // Total length ≤ 200
        expect(result.task_text.length).toBeLessThanOrEqual(200);

        return true;
      }),
    );
  });
});

describe("formatFinding unit tests", () => {
  it("comment_text has correct order: tag header → blank → message → suggestion block → blank → review run → marker", () => {
    const finding = {
      priority: "P0" as const,
      finding_type: "test-finding",
      file_path: "src/test.ts",
      line_number: 42,
      line_type: "ADDED" as const,
      message: "Test message",
      suggestion: "Suggested fix",
      source_layer: "spec-check" as const,
    };
    const runId = "run-123";
    const prefix = "forge";

    const result = formatFinding(finding, runId, prefix);
    const hash = computeFindingHash(finding);
    const marker = buildMarker(prefix, hash);

    // Check order
    const lines = result.comment_text.split("\n");

    // Find positions
    const tagHeaderIdx = lines.findIndex((l) => l.startsWith("**[Forge"));
    const firstBlankAfterHeader = lines.indexOf("", tagHeaderIdx + 1);
    const messageIdx = lines.indexOf(finding.message, firstBlankAfterHeader + 1);
    const suggestionBlockIdx = lines.findIndex((l) => l.trim() === "```suggestion");
    const secondBlankIdx = lines.indexOf("", suggestionBlockIdx + 2);
    const reviewRunIdx = lines.findIndex((l) => l.includes("_review run:"));
    const markerIdx = lines.indexOf(marker);

    expect(tagHeaderIdx).toBeGreaterThanOrEqual(0);
    expect(tagHeaderIdx).toBeLessThan(firstBlankAfterHeader);
    expect(firstBlankAfterHeader).toBeLessThan(messageIdx);
    expect(messageIdx).toBeLessThan(suggestionBlockIdx);
    expect(secondBlankIdx).toBeLessThan(reviewRunIdx);
    expect(reviewRunIdx).toBeLessThan(markerIdx);
  });

  it("P0/P1 task title contains file_path:line_number, total ≤ 200 chars; truncation preserves prefix and marker", () => {
    const findingShort = {
      priority: "P0" as const,
      finding_type: "short",
      file_path: "src/short.ts",
      line_number: 1,
      line_type: "ADDED" as const,
      message: "Short message",
      source_layer: "spec-check" as const,
    };

    const findingLong = {
      priority: "P1" as const,
      finding_type: "very-long-finding-type-name",
      file_path: "src/very/long/path/to/a/file/with/many/directories/that/goes/on/and/on.ts",
      line_number: 9999,
      line_type: "ADDED" as const,
      message:
        "This is an extremely long message that should trigger truncation when combined with the file path and line number and the prefix and marker",
      source_layer: "quality-check" as const,
    };

    const runId = "test-run";
    const prefix = "forge";

    const resultShort = formatFinding(findingShort, runId, prefix);
    const resultLong = formatFinding(findingLong, runId, prefix);

    // Short case: full content
    expect(resultShort.task_text).toContain("src/short.ts:1");
    expect(resultShort.task_text).toContain("Short message");
    expect(resultShort.task_text.length).toBeLessThanOrEqual(200);

    // Long case: truncated but preserves prefix and marker
    const hashLong = computeFindingHash(findingLong);
    const markerLong = buildMarker(prefix, hashLong);
    expect(resultLong.task_text).toContain(findingLong.file_path);
    expect(resultLong.task_text).toContain(`:${findingLong.line_number}`);
    expect(resultLong.task_text).toContain("[Forge P1]");
    expect(resultLong.task_text).toContain(markerLong);
    expect(resultLong.task_text.length).toBeLessThanOrEqual(200);
  });

  it("Message with triple backticks → comment_text uses quadruple backtick fence, extractMarker still works", () => {
    const finding = {
      priority: "P0" as const,
      finding_type: "code-finding",
      file_path: "src/test.ts",
      line_number: 10,
      line_type: "REMOVED" as const,
      message: "Use ```code``` here",
      suggestion: "Replace with ```other```",
      source_layer: "security-check" as const,
    };
    const runId = "run-456";
    const prefix = "forge";

    const result = formatFinding(finding, runId, prefix);

    // Should use quadruple backtick fence
    expect(result.comment_text).toContain("````suggestion");
    // Check that no line starts with ```suggestion
    const lines = result.comment_text.split("\n");
    const hasTripleBacktickSuggestion = lines.some((l) => l.trim() === "```suggestion");
    expect(hasTripleBacktickSuggestion).toBe(false);

    // extractMarker should still work
    const extractedHash = extractMarker(result.comment_text, prefix);
    const expectedHash = computeFindingHash(finding);
    expect(extractedHash).toBe(expectedHash);
  });

  it("done_comment_text has exact format", () => {
    const finding = {
      priority: "P0" as const,
      finding_type: "test",
      file_path: "src/test.ts",
      line_number: 1,
      line_type: "ADDED" as const,
      message: "Test",
      source_layer: "spec-check" as const,
    };
    const runId = "run-789";
    const prefix = "forge";

    const result = formatFinding(finding, runId, prefix);
    const hash = computeFindingHash(finding);
    const marker = buildMarker(prefix, hash);

    expect(result.done_comment_text).toBe(
      `Forge auto-resolved (no longer present in review ${runId}). ${marker}`,
    );
  });

  it("Attack E regression: injected marker in message must not override real hash in task_text", () => {
    const finding = {
      priority: "P0" as const,
      finding_type: "security.injection",
      file_path: "real.ts",
      line_number: 42,
      line_type: "ADDED" as const,
      message: "harmless\n[Forge P0] fake.ts:1 — fake_msg <!-- forge-review:hash=deadbeefcafe -->",
      source_layer: "security-check" as const,
    };
    const runId = "run-attack-e";
    const prefix = "forge-review";
    const realHash = computeFindingHash(finding);

    const result = formatFinding(finding, runId, prefix);

    // extractMarker on the resulting task_text must return the REAL hash, not the injected one
    const extracted = extractMarker(result.task_text, prefix);
    expect(extracted).toBe(realHash);
    expect(extracted).not.toBe("deadbeefcafe");

    // comment_text should also yield the real hash
    const extractedComment = extractMarker(result.comment_text, prefix);
    expect(extractedComment).toBe(realHash);
  });

  it("reopen_comment_text has exact format", () => {
    const finding = {
      priority: "P0" as const,
      finding_type: "test",
      file_path: "src/test.ts",
      line_number: 1,
      line_type: "ADDED" as const,
      message: "Test",
      source_layer: "spec-check" as const,
    };
    const runId = "run-999";
    const prefix = "forge";

    const result = formatFinding(finding, runId, prefix);
    const hash = computeFindingHash(finding);
    const marker = buildMarker(prefix, hash);

    expect(result.reopen_comment_text).toBe(
      `Forge re-opened (still present in review ${runId}). ${marker}`,
    );
  });
});
