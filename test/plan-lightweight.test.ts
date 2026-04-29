/**
 * Unit and property tests for the Lightweight Task format (Plan Document Streamlining).
 *
 * **Feature: plan-document-streamlining**
 *
 * Tests cover:
 *   - detectPlanFormat (Property 4)
 *   - extractHeadingAnchors (Property 2)
 *   - validateLightweightTask (Property 1, Property 6)
 *   - validateLightweightPlan (Property 5)
 *   - validateDesignReferences (Property 3)
 *   - validatePlan dispatcher (format routing)
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AtomicTask,
  detectPlanFormat,
  extractHeadingAnchors,
  FORBIDDEN_PLACEHOLDERS,
  type LightweightTask,
  validateAtomicTask,
  validateDesignReferences,
  validateLightweightPlan,
  validateLightweightTask,
  validatePlan,
  validatePlanTasks,
} from "../src/plan.js";

// ---------------------------------------------------------------------------
// Generators — shared primitives (reuse safeStringArb pattern)
// ---------------------------------------------------------------------------

const safeStringArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 20,
  })
  .map((chars) => chars.join(""))
  .filter((s) => {
    const lower = s.toLowerCase();
    return !FORBIDDEN_PLACEHOLDERS.some((p) => lower.includes(p.toLowerCase()));
  });

const filePathArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("src", "lib", "test", "app"),
    safeStringArb,
    fc.constantFrom(".ts", ".tsx", ".js", ".jsx"),
  )
  .map(([dir, name, ext]) => `${dir}/${name}${ext}`);

const runCommandArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("npx vitest run", "npm test", "npx jest"), safeStringArb)
  .map(([cmd, grep]) => `${cmd} --grep "${grep}"`);

const commitMessageArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("feat", "fix", "refactor", "test", "chore"), safeStringArb, safeStringArb)
  .map(([type, scope, desc]) => `${type}(${scope}): ${desc}`);

const designRefArb: fc.Arbitrary<string> = fc
  .tuple(safeStringArb, safeStringArb)
  .map(([section, anchor]) => `design.md#${section}-${anchor}`);

// ---------------------------------------------------------------------------
// Generators — valid LightweightTask
// ---------------------------------------------------------------------------

const validLightweightTaskArb: fc.Arbitrary<LightweightTask> = fc
  .tuple(
    fc.integer({ min: 1, max: 100 }),
    safeStringArb,
    filePathArb,
    safeStringArb,
    designRefArb,
    fc.option(fc.integer({ min: 1, max: 10 })),
    runCommandArb,
    commitMessageArb,
  )
  .map(
    ([
      taskNumber,
      title,
      filePath,
      goal,
      designReference,
      propertyRef,
      verifyCommand,
      commitMessage,
    ]) => ({
      taskNumber,
      title,
      filePath,
      goal,
      designReference,
      ...(propertyRef !== null ? { propertyRef } : {}),
      verifyCommand,
      commitMessage,
    }),
  );

// ---------------------------------------------------------------------------
// Generators — invalid LightweightTask (missing field)
// ---------------------------------------------------------------------------

const lightweightTaskMissingFieldArb: fc.Arbitrary<LightweightTask> = fc.oneof(
  validLightweightTaskArb.map((t) => ({ ...t, title: "" })),
  validLightweightTaskArb.map((t) => ({ ...t, filePath: "" })),
  validLightweightTaskArb.map((t) => ({ ...t, goal: "" })),
  validLightweightTaskArb.map((t) => ({ ...t, designReference: "" })),
  validLightweightTaskArb.map((t) => ({ ...t, verifyCommand: "" })),
  validLightweightTaskArb.map((t) => ({ ...t, commitMessage: "" })),
);

// ---------------------------------------------------------------------------
// Generators — task with placeholder
// ---------------------------------------------------------------------------

const forbiddenPlaceholderArb: fc.Arbitrary<string> = fc.constantFrom(...FORBIDDEN_PLACEHOLDERS);

const lightweightTaskWithPlaceholderArb: fc.Arbitrary<LightweightTask> = fc
  .tuple(validLightweightTaskArb, forbiddenPlaceholderArb, fc.integer({ min: 0, max: 5 }))
  .map(([task, placeholder, field]) => {
    const fields = [
      "title",
      "filePath",
      "goal",
      "designReference",
      "verifyCommand",
      "commitMessage",
    ] as const;
    const target = fields[field % fields.length];
    return { ...task, [target]: `${task[target]} ${placeholder}` };
  });

// ---------------------------------------------------------------------------
// Generators — markdown with headings
// ---------------------------------------------------------------------------

const headingTextArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 ".split("")), {
    minLength: 1,
    maxLength: 40,
  })
  .map((chars) => chars.join("").trim())
  .filter((s) => s.length > 0);

const markdownWithHeadingsArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(fc.tuple(fc.integer({ min: 1, max: 6 }), headingTextArb), {
      minLength: 1,
      maxLength: 10,
    }),
    safeStringArb,
  )
  .map(([headings, body]) => {
    const headingLines = headings.map(([level, text]) => `${"#".repeat(level)} ${text}`);
    return [...headingLines, body].join("\n");
  });

// ---------------------------------------------------------------------------
// Generators — frontmatter with format field
// ---------------------------------------------------------------------------

const frontmatterWithFormatArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant('format: "lightweight"'),
  fc.constant("format: lightweight"),
  fc.constant('format: "full"'),
  fc.constant("format: full"),
  fc.constant(""),
  safeStringArb.map((s) => `format: ${s}`),
);

// ---------------------------------------------------------------------------
// Property 1: LightweightTask validation — valid tasks pass, invalid tasks fail
// ---------------------------------------------------------------------------

describe("Property 1: LightweightTask validation — valid tasks pass, invalid tasks fail", () => {
  it("valid LightweightTasks pass validation", () => {
    fc.assert(
      fc.property(validLightweightTaskArb, (task) => {
        const result = validateLightweightTask(task);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("LightweightTasks with missing required fields fail validation", () => {
    fc.assert(
      fc.property(lightweightTaskMissingFieldArb, (task) => {
        const result = validateLightweightTask(task);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Heading anchor extraction preserves heading identity
// ---------------------------------------------------------------------------

describe("Property 2: Heading anchor extraction preserves heading identity", () => {
  it("anchors are lowercase, hyphenated, alphanumeric only", () => {
    fc.assert(
      fc.property(markdownWithHeadingsArb, (content) => {
        const anchors = extractHeadingAnchors(content);
        for (const anchor of anchors) {
          expect(anchor).toBe(anchor.toLowerCase());
          expect(anchor).toMatch(/^[a-z0-9-]*$/);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("number of anchors equals number of headings", () => {
    fc.assert(
      fc.property(markdownWithHeadingsArb, (content) => {
        const headingCount = (content.match(/^#{1,6}\s+.+$/gm) || []).length;
        const anchors = extractHeadingAnchors(content);
        expect(anchors).toHaveLength(headingCount);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Design Reference validation — existing anchors pass, missing fail
// ---------------------------------------------------------------------------

describe("Property 3: Design Reference validation", () => {
  it("references matching existing headings pass", () => {
    fc.assert(
      fc.property(markdownWithHeadingsArb, (content) => {
        const anchors = extractHeadingAnchors(content);
        if (anchors.length === 0) return;
        const refs = anchors.map((a) => `design.md#${a}`);
        const result = validateDesignReferences(refs, content);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("references NOT matching any heading fail", () => {
    fc.assert(
      fc.property(markdownWithHeadingsArb, safeStringArb, (content, fakeAnchor) => {
        const refs = [`design.md#${fakeAnchor}`];
        const anchors = extractHeadingAnchors(content);
        // Ensure fakeAnchor doesn't accidentally match
        if (anchors.includes(fakeAnchor)) return;
        const result = validateDesignReferences(refs, content);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Format detection defaults to "full"
// ---------------------------------------------------------------------------

describe("Property 4: Format detection defaults to full", () => {
  it('returns "lightweight" only when frontmatter has format: "lightweight"', () => {
    fc.assert(
      fc.property(frontmatterWithFormatArb, (frontmatter) => {
        const format = detectPlanFormat(frontmatter);
        const hasLightweight = /format:\s*["']?lightweight["']?/.test(frontmatter);
        if (hasLightweight) {
          expect(format).toBe("lightweight");
        } else {
          expect(format).toBe("full");
        }
      }),
      { numRuns: 200 },
    );
  });

  it('returns "full" for empty frontmatter', () => {
    expect(detectPlanFormat("")).toBe("full");
  });

  it('returns "full" for frontmatter without format field', () => {
    expect(detectPlanFormat('topic: "test"\nstatus: "draft"')).toBe("full");
  });

  it('returns "lightweight" for explicit format: lightweight', () => {
    expect(detectPlanFormat('format: "lightweight"')).toBe("lightweight");
    expect(detectPlanFormat("format: lightweight")).toBe("lightweight");
  });
});

// ---------------------------------------------------------------------------
// Property 5: Lightweight plan validation — valid plans pass, invalid fail
// ---------------------------------------------------------------------------

describe("Property 5: Lightweight plan validation", () => {
  it("non-empty array of valid tasks with valid deps passes", () => {
    fc.assert(
      fc.property(fc.array(validLightweightTaskArb, { minLength: 1, maxLength: 10 }), (tasks) => {
        // Assign sequential numbers and valid deps
        const numbered = tasks.map((t, i) => ({
          ...t,
          taskNumber: i + 1,
          dependsOn: i > 0 ? [i] : undefined,
        }));
        expect(validateLightweightPlan(numbered)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("empty array fails", () => {
    expect(validateLightweightPlan([])).toBe(false);
  });

  it("array with invalid task fails", () => {
    fc.assert(
      fc.property(
        fc.array(validLightweightTaskArb, { minLength: 0, maxLength: 3 }),
        lightweightTaskMissingFieldArb,
        fc.array(validLightweightTaskArb, { minLength: 0, maxLength: 3 }),
        (before, bad, after) => {
          const tasks = [
            ...before.map((t, i) => ({ ...t, taskNumber: i + 1 })),
            { ...bad, taskNumber: before.length + 1 },
            ...after.map((t, i) => ({ ...t, taskNumber: before.length + 2 + i })),
          ];
          expect(validateLightweightPlan(tasks)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("array with invalid dependency fails", () => {
    const task: LightweightTask = {
      taskNumber: 1,
      title: "Test task",
      filePath: "src/test.ts",
      goal: "Test goal",
      designReference: "design.md#test",
      verifyCommand: "npm test",
      commitMessage: "feat: test",
      dependsOn: [99],
    };
    expect(validateLightweightPlan([task])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 6: Placeholder scanning covers all lightweight task text fields
// ---------------------------------------------------------------------------

describe("Property 6: Placeholder scanning covers all text fields", () => {
  it("injecting placeholder into any text field causes validation failure", () => {
    fc.assert(
      fc.property(lightweightTaskWithPlaceholderArb, (task) => {
        const result = validateLightweightTask(task);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("forbidden placeholders"))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — detectPlanFormat
// ---------------------------------------------------------------------------

describe("detectPlanFormat — unit tests", () => {
  it('returns "lightweight" for format: "lightweight" (quoted)', () => {
    expect(detectPlanFormat('topic: "test"\nformat: "lightweight"')).toBe("lightweight");
  });

  it('returns "lightweight" for format: lightweight (unquoted)', () => {
    expect(detectPlanFormat('topic: "test"\nformat: lightweight')).toBe("lightweight");
  });

  it('returns "full" for format: "full"', () => {
    expect(detectPlanFormat('format: "full"')).toBe("full");
  });

  it('returns "full" when format field is missing', () => {
    expect(detectPlanFormat('topic: "test"\nstatus: "draft"')).toBe("full");
  });

  it('returns "full" for empty string', () => {
    expect(detectPlanFormat("")).toBe("full");
  });

  it('returns "full" for unrecognized format value', () => {
    expect(detectPlanFormat("format: unknown")).toBe("full");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — extractHeadingAnchors
// ---------------------------------------------------------------------------

describe("extractHeadingAnchors — unit tests", () => {
  it("extracts anchors from simple headings", () => {
    const content = "## Components and Interfaces\n## Data Models";
    expect(extractHeadingAnchors(content)).toEqual(["components-and-interfaces", "data-models"]);
  });

  it("handles special characters by stripping them", () => {
    const content = "## What's New & Changed!";
    const anchors = extractHeadingAnchors(content);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toBe("whats-new--changed");
  });

  it("handles CJK characters (stripped, leaving only alphanumeric)", () => {
    const content = "## 新功能 Overview";
    const anchors = extractHeadingAnchors(content);
    expect(anchors).toHaveLength(1);
    // CJK chars are stripped, leaving "overview"
    expect(anchors[0]).toBe("overview");
  });

  it("returns empty array for content with no headings", () => {
    expect(extractHeadingAnchors("Just some text\nNo headings here")).toEqual([]);
  });

  it("handles headings with inline code", () => {
    const content = "## Using `validatePlan` function";
    const anchors = extractHeadingAnchors(content);
    expect(anchors).toHaveLength(1);
    // Backticks stripped
    expect(anchors[0]).toBe("using-validateplan-function");
  });

  it("handles all heading levels (h1-h6)", () => {
    const content = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
    expect(extractHeadingAnchors(content)).toHaveLength(6);
  });

  it("does not match non-heading lines starting with #", () => {
    const content = "Not a heading #inline\n## Real Heading";
    const anchors = extractHeadingAnchors(content);
    expect(anchors).toEqual(["real-heading"]);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — validateLightweightTask
// ---------------------------------------------------------------------------

describe("validateLightweightTask — unit tests", () => {
  const validTask: LightweightTask = {
    taskNumber: 1,
    title: "Add format detection",
    filePath: "src/plan.ts",
    goal: "Add detectPlanFormat function",
    designReference: "design.md#new-types",
    verifyCommand: "npx vitest run",
    commitMessage: "feat(plan): add format detection",
  };

  it("valid task passes", () => {
    expect(validateLightweightTask(validTask).valid).toBe(true);
  });

  it("fails for empty title", () => {
    const result = validateLightweightTask({ ...validTask, title: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Missing"))).toBe(true);
  });

  it("fails for empty filePath", () => {
    const result = validateLightweightTask({ ...validTask, filePath: "" });
    expect(result.valid).toBe(false);
  });

  it("fails for empty goal", () => {
    const result = validateLightweightTask({ ...validTask, goal: "" });
    expect(result.valid).toBe(false);
  });

  it("fails for empty designReference", () => {
    const result = validateLightweightTask({ ...validTask, designReference: "" });
    expect(result.valid).toBe(false);
  });

  it("fails for empty verifyCommand", () => {
    const result = validateLightweightTask({ ...validTask, verifyCommand: "" });
    expect(result.valid).toBe(false);
  });

  it("fails for empty commitMessage", () => {
    const result = validateLightweightTask({ ...validTask, commitMessage: "" });
    expect(result.valid).toBe(false);
  });

  it("fails for invalid design reference format", () => {
    const result = validateLightweightTask({ ...validTask, designReference: "not-a-valid-ref" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid Design Reference format"))).toBe(true);
  });

  it("fails for placeholder in title", () => {
    const result = validateLightweightTask({ ...validTask, title: "TBD task" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("forbidden placeholders"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — validateDesignReferences
// ---------------------------------------------------------------------------

describe("validateDesignReferences — unit tests", () => {
  const designContent = `## Components and Interfaces\nSome content\n## Data Models\nMore content\n## Testing Strategy`;

  it("all valid references pass", () => {
    const refs = ["design.md#components-and-interfaces", "design.md#data-models"];
    const result = validateDesignReferences(refs, designContent);
    expect(result.valid).toBe(true);
  });

  it("stale reference fails", () => {
    const refs = ["design.md#components-and-interfaces", "design.md#nonexistent-section"];
    const result = validateDesignReferences(refs, designContent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("nonexistent-section"))).toBe(true);
  });

  it("empty references array passes", () => {
    const result = validateDesignReferences([], designContent);
    expect(result.valid).toBe(true);
  });

  it("invalid reference format fails", () => {
    const refs = ["not-a-valid-ref"];
    const result = validateDesignReferences(refs, designContent);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — validatePlan dispatcher
// ---------------------------------------------------------------------------

describe("validatePlan — dispatcher", () => {
  it("routes to lightweight validator for lightweight format", () => {
    const frontmatter = 'format: "lightweight"';
    const tasks: LightweightTask[] = [
      {
        taskNumber: 1,
        title: "Test",
        filePath: "src/test.ts",
        goal: "Test goal",
        designReference: "design.md#test",
        verifyCommand: "npm test",
        commitMessage: "feat: test",
      },
    ];
    const result = validatePlan(frontmatter, tasks);
    expect(result.format).toBe("lightweight");
    expect(result.valid).toBe(true);
  });

  it("routes to full validator for full format", () => {
    const frontmatter = 'format: "full"';
    const tasks: AtomicTask[] = [
      {
        taskNumber: 1,
        title: "Test",
        filePath: "src/test.ts",
        estimatedMinutes: 3,
        tddSteps: {
          red: { testFile: "test/a.ts", testCode: "it('a', ()=>1)", runCommand: "npx vitest" },
          green: {
            sourceFile: "src/a.ts",
            sourceCode: "export const a=1",
            runCommand: "npx vitest",
          },
          refactor: "clean up",
        },
        verifyCommand: "npx vitest",
        commitMessage: "feat: test",
      },
    ];
    const result = validatePlan(frontmatter, tasks);
    expect(result.format).toBe("full");
    expect(result.valid).toBe(true);
  });

  it("defaults to full format when format field missing", () => {
    const frontmatter = 'topic: "test"';
    const result = validatePlan(frontmatter, []);
    expect(result.format).toBe("full");
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility — existing AtomicTask tests still pass
// ---------------------------------------------------------------------------

describe("Backward compatibility", () => {
  it("validateAtomicTask still works", () => {
    const task: AtomicTask = {
      taskNumber: 1,
      title: "Test",
      filePath: "src/test.ts",
      estimatedMinutes: 3,
      tddSteps: {
        red: { testFile: "test/a.ts", testCode: "it('a', ()=>1)", runCommand: "npx vitest" },
        green: { sourceFile: "src/a.ts", sourceCode: "export const a=1", runCommand: "npx vitest" },
        refactor: "clean up",
      },
      verifyCommand: "npx vitest",
      commitMessage: "feat: test",
    };
    expect(validateAtomicTask(task).valid).toBe(true);
  });

  it("validatePlanTasks still works", () => {
    const task: AtomicTask = {
      taskNumber: 1,
      title: "Test",
      filePath: "src/test.ts",
      estimatedMinutes: 3,
      tddSteps: {
        red: { testFile: "test/a.ts", testCode: "it('a', ()=>1)", runCommand: "npx vitest" },
        green: { sourceFile: "src/a.ts", sourceCode: "export const a=1", runCommand: "npx vitest" },
        refactor: "clean up",
      },
      verifyCommand: "npx vitest",
      commitMessage: "feat: test",
    };
    expect(validatePlanTasks([task])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// P1 Fix verification — cycle detection + validatePlan integration
// ---------------------------------------------------------------------------

describe("Cycle detection in lightweight plans", () => {
  const makeTask = (num: number, deps?: number[]): LightweightTask => ({
    taskNumber: num,
    title: `Task ${num}`,
    filePath: `src/file${num}.ts`,
    goal: `Goal ${num}`,
    designReference: `design.md#section-${num}`,
    verifyCommand: "npx vitest",
    commitMessage: `feat: task${num}`,
    dependsOn: deps,
  });

  it("rejects a direct cycle (A → B → A)", () => {
    const tasks = [makeTask(1, [2]), makeTask(2, [1])];
    expect(validateLightweightPlan(tasks)).toBe(false);
  });

  it("rejects a transitive cycle (A → B → C → A)", () => {
    const tasks = [makeTask(1, [3]), makeTask(2, [1]), makeTask(3, [2])];
    expect(validateLightweightPlan(tasks)).toBe(false);
  });

  it("accepts a valid DAG with dependencies", () => {
    const tasks = [makeTask(1), makeTask(2, [1]), makeTask(3, [1, 2])];
    expect(validateLightweightPlan(tasks)).toBe(true);
  });

  it("accepts independent tasks with no dependencies", () => {
    const tasks = [makeTask(1), makeTask(2), makeTask(3)];
    expect(validateLightweightPlan(tasks)).toBe(true);
  });

  it("accepts a self-less chain (A → B → C)", () => {
    const tasks = [makeTask(1), makeTask(2, [1]), makeTask(3, [2])];
    expect(validateLightweightPlan(tasks)).toBe(true);
  });
});

describe("validatePlan with designContent integration", () => {
  const lwFrontmatter = 'format: "lightweight"';
  const designContent = "## Section 1\n\nSome content\n\n## Section 2\n\nMore content";

  const makeTask = (num: number, ref = `design.md#section-${num}`): LightweightTask => ({
    taskNumber: num,
    title: `Task ${num}`,
    filePath: `src/file${num}.ts`,
    goal: `Goal ${num}`,
    designReference: ref,
    verifyCommand: "npx vitest",
    commitMessage: `feat: task${num}`,
  });

  it("reports both task errors and design reference errors", () => {
    const tasks = [
      makeTask(1, "design.md#section-1"),
      { ...makeTask(2), goal: "" }, // invalid task
      makeTask(3, "design.md#nonexistent"), // stale ref
    ];
    const result = validatePlan(lwFrontmatter, tasks, designContent);
    expect(result.valid).toBe(false);
    // Should have task error for task 2
    expect(result.errors.some((e) => e.includes("Task 2"))).toBe(true);
    // Should have design ref error for task 3
    expect(result.errors.some((e) => e.includes("nonexistent"))).toBe(true);
  });

  it("reports only design reference errors when tasks are valid but refs are stale", () => {
    const tasks = [makeTask(1, "design.md#section-1"), makeTask(2, "design.md#missing-section")];
    const result = validatePlan(lwFrontmatter, tasks, designContent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("missing-section"))).toBe(true);
  });

  it("passes when all tasks are valid and all refs exist", () => {
    const tasks = [makeTask(1, "design.md#section-1"), makeTask(2, "design.md#section-2")];
    const result = validatePlan(lwFrontmatter, tasks, designContent);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports cycle errors alongside task errors", () => {
    const tasks = [
      { ...makeTask(1), dependsOn: [2] },
      { ...makeTask(2), dependsOn: [1] },
    ];
    const result = validatePlan(lwFrontmatter, tasks, designContent);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Cycle detected"))).toBe(true);
  });
});
