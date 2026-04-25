/**
 * Property tests for the Plan engine (Property 9).
 *
 * Property 9: Plan 任务有效性
 *   - Each atomic task must contain: file path, TDD steps (RED/GREEN/REFACTOR),
 *     complete code, verify command, and commit message
 *   - Estimated time must be 2-5 minutes
 *   - No forbidden placeholders
 *   - Referenced types/functions must have definitions in the plan
 *
 * **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AtomicTask,
  FORBIDDEN_PLACEHOLDERS,
  scanForPlaceholders,
  type TDDSteps,
  validateAtomicTask,
  validatePlanTasks,
} from "../src/plan.js";

// ---------------------------------------------------------------------------
// Generators — shared primitives
// ---------------------------------------------------------------------------

/**
 * Non-empty alphanumeric string guaranteed to not contain any forbidden
 * placeholder substrings (e.g., "tbd", "todo"). We filter out any generated
 * string that accidentally contains a placeholder as a substring.
 */
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

/** File path like `src/services/foo.ts`. */
const filePathArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("src", "lib", "test", "app"),
    safeStringArb,
    fc.constantFrom(".ts", ".tsx", ".js", ".jsx"),
  )
  .map(([dir, name, ext]) => `${dir}/${name}${ext}`);

/** A run command like `npx vitest run --grep "something"`. */
const runCommandArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("npx vitest run", "npm test", "npx jest"), safeStringArb)
  .map(([cmd, grep]) => `${cmd} --grep "${grep}"`);

/** Source code snippet (safe, no placeholders). */
const codeSnippetArb: fc.Arbitrary<string> = fc
  .tuple(safeStringArb, safeStringArb)
  .map(([name, body]) => `export function ${name}() { return "${body}"; }`);

/** Commit message like `feat(scope): description`. */
const commitMessageArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("feat", "fix", "refactor", "test", "chore"), safeStringArb, safeStringArb)
  .map(([type, scope, desc]) => `${type}(${scope}): ${desc}`);

/** Refactor description (safe string). */
const refactorDescArb: fc.Arbitrary<string> = safeStringArb.map(
  (s) => `Extract ${s} into separate module`,
);

// ---------------------------------------------------------------------------
// Generators — valid TDD steps
// ---------------------------------------------------------------------------

const validTDDStepsArb: fc.Arbitrary<TDDSteps> = fc
  .tuple(
    filePathArb, // red testFile
    codeSnippetArb, // red testCode
    runCommandArb, // red runCommand
    filePathArb, // green sourceFile
    codeSnippetArb, // green sourceCode
    runCommandArb, // green runCommand
    refactorDescArb, // refactor
  )
  .map(([testFile, testCode, redCmd, sourceFile, sourceCode, greenCmd, refactor]) => ({
    red: { testFile, testCode, runCommand: redCmd },
    green: { sourceFile, sourceCode, runCommand: greenCmd },
    refactor,
  }));

// ---------------------------------------------------------------------------
// Generators — valid atomic task
// ---------------------------------------------------------------------------

/** Estimated minutes in the valid range [2, 5]. */
const validMinutesArb: fc.Arbitrary<number> = fc.integer({ min: 2, max: 5 });

/** A fully valid atomic task. */
const validAtomicTaskArb: fc.Arbitrary<AtomicTask> = fc
  .tuple(
    fc.integer({ min: 1, max: 100 }), // taskNumber
    safeStringArb, // title
    filePathArb, // filePath
    validMinutesArb, // estimatedMinutes
    validTDDStepsArb, // tddSteps
    runCommandArb, // verifyCommand
    commitMessageArb, // commitMessage
  )
  .map(
    ([taskNumber, title, filePath, estimatedMinutes, tddSteps, verifyCommand, commitMessage]) => ({
      taskNumber,
      title,
      filePath,
      estimatedMinutes,
      tddSteps,
      verifyCommand,
      commitMessage,
    }),
  );

// ---------------------------------------------------------------------------
// Generators — invalid atomic tasks (missing fields)
// ---------------------------------------------------------------------------

/** Task with empty filePath. */
const taskMissingFilePathArb: fc.Arbitrary<AtomicTask> = validAtomicTaskArb.map((task) => ({
  ...task,
  filePath: "",
}));

/** Task with empty title. */
const taskMissingTitleArb: fc.Arbitrary<AtomicTask> = validAtomicTaskArb.map((task) => ({
  ...task,
  title: "",
}));

/** Task with empty verify command. */
const taskMissingVerifyArb: fc.Arbitrary<AtomicTask> = validAtomicTaskArb.map((task) => ({
  ...task,
  verifyCommand: "",
}));

/** Task with empty commit message. */
const taskMissingCommitArb: fc.Arbitrary<AtomicTask> = validAtomicTaskArb.map((task) => ({
  ...task,
  commitMessage: "",
}));

/** Task with empty TDD RED test code. */
const taskMissingRedCodeArb: fc.Arbitrary<AtomicTask> = validAtomicTaskArb.map((task) => ({
  ...task,
  tddSteps: {
    ...task.tddSteps,
    red: { ...task.tddSteps.red, testCode: "" },
  },
}));

/** Task with empty TDD GREEN source code. */
const taskMissingGreenCodeArb: fc.Arbitrary<AtomicTask> = validAtomicTaskArb.map((task) => ({
  ...task,
  tddSteps: {
    ...task.tddSteps,
    green: { ...task.tddSteps.green, sourceCode: "" },
  },
}));

/** Task with empty TDD REFACTOR description. */
const taskMissingRefactorArb: fc.Arbitrary<AtomicTask> = validAtomicTaskArb.map((task) => ({
  ...task,
  tddSteps: { ...task.tddSteps, refactor: "" },
}));

/** Any task with one missing required field. */
const taskWithMissingFieldArb: fc.Arbitrary<AtomicTask> = fc.oneof(
  taskMissingFilePathArb,
  taskMissingTitleArb,
  taskMissingVerifyArb,
  taskMissingCommitArb,
  taskMissingRedCodeArb,
  taskMissingGreenCodeArb,
  taskMissingRefactorArb,
);

// ---------------------------------------------------------------------------
// Generators — invalid time range
// ---------------------------------------------------------------------------

/** Estimated minutes below the minimum (< 2). */
const tooShortMinutesArb: fc.Arbitrary<number> = fc.integer({ min: -10, max: 1 });

/** Estimated minutes above the maximum (> 5). */
const tooLongMinutesArb: fc.Arbitrary<number> = fc.integer({ min: 6, max: 120 });

/** Task with time outside the valid 2-5 range. */
const taskWithInvalidTimeArb: fc.Arbitrary<AtomicTask> = fc
  .tuple(validAtomicTaskArb, fc.oneof(tooShortMinutesArb, tooLongMinutesArb))
  .map(([task, minutes]) => ({ ...task, estimatedMinutes: minutes }));

// ---------------------------------------------------------------------------
// Generators — tasks with forbidden placeholders
// ---------------------------------------------------------------------------

/** Pick a random forbidden placeholder. */
const forbiddenPlaceholderArb: fc.Arbitrary<string> = fc.constantFrom(...FORBIDDEN_PLACEHOLDERS);

/** A task with a forbidden placeholder injected into the title. */
const taskWithPlaceholderInTitleArb: fc.Arbitrary<AtomicTask> = fc
  .tuple(validAtomicTaskArb, forbiddenPlaceholderArb)
  .map(([task, placeholder]) => ({
    ...task,
    title: `${task.title} ${placeholder} something`,
  }));

/** A task with a forbidden placeholder injected into the source code. */
const taskWithPlaceholderInCodeArb: fc.Arbitrary<AtomicTask> = fc
  .tuple(validAtomicTaskArb, forbiddenPlaceholderArb)
  .map(([task, placeholder]) => ({
    ...task,
    tddSteps: {
      ...task.tddSteps,
      green: {
        ...task.tddSteps.green,
        sourceCode: `// ${placeholder}\n${task.tddSteps.green.sourceCode}`,
      },
    },
  }));

/** A task with a forbidden placeholder injected into the commit message. */
const taskWithPlaceholderInCommitArb: fc.Arbitrary<AtomicTask> = fc
  .tuple(validAtomicTaskArb, forbiddenPlaceholderArb)
  .map(([task, placeholder]) => ({
    ...task,
    commitMessage: `${task.commitMessage} ${placeholder}`,
  }));

/** Any task with a forbidden placeholder somewhere. */
const taskWithPlaceholderArb: fc.Arbitrary<AtomicTask> = fc.oneof(
  taskWithPlaceholderInTitleArb,
  taskWithPlaceholderInCodeArb,
  taskWithPlaceholderInCommitArb,
);

// ---------------------------------------------------------------------------
// Property 9: Plan 任务有效性
// ---------------------------------------------------------------------------

describe("Property 9: Plan 任务有效性", () => {
  // -----------------------------------------------------------------------
  // (a) Valid tasks pass validation — all required fields present
  // -----------------------------------------------------------------------

  it("valid atomic tasks pass validation — all required fields present (Req 4.2)", () => {
    fc.assert(
      fc.property(validAtomicTaskArb, (task) => {
        const result = validateAtomicTask(task);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // (a) Tasks with missing fields fail validation
  // -----------------------------------------------------------------------

  it("tasks with missing required fields fail validation (Req 4.2)", () => {
    fc.assert(
      fc.property(taskWithMissingFieldArb, (task) => {
        const result = validateAtomicTask(task);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // (b) Estimated time must be 2-5 minutes
  // -----------------------------------------------------------------------

  it("tasks with time in 2-5 min range pass time validation (Req 4.3)", () => {
    fc.assert(
      fc.property(validAtomicTaskArb, (task) => {
        expect(task.estimatedMinutes).toBeGreaterThanOrEqual(2);
        expect(task.estimatedMinutes).toBeLessThanOrEqual(5);

        const result = validateAtomicTask(task);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("tasks with time outside 2-5 min range fail validation (Req 4.3)", () => {
    fc.assert(
      fc.property(taskWithInvalidTimeArb, (task) => {
        expect(task.estimatedMinutes < 2 || task.estimatedMinutes > 5).toBe(true);

        const result = validateAtomicTask(task);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("Estimated time"))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // (c) No forbidden placeholders
  // -----------------------------------------------------------------------

  it("tasks with forbidden placeholders fail validation (Req 4.4)", () => {
    fc.assert(
      fc.property(taskWithPlaceholderArb, (task) => {
        const result = validateAtomicTask(task);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("forbidden placeholders"))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("clean tasks without placeholders pass placeholder check (Req 4.4)", () => {
    fc.assert(
      fc.property(validAtomicTaskArb, (task) => {
        // Valid tasks are generated with safe strings — no placeholders
        const result = validateAtomicTask(task);
        expect(result.errors.some((e) => e.includes("forbidden placeholders"))).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // (d) validatePlanTasks — all tasks must be valid
  // -----------------------------------------------------------------------

  it("plan with all valid tasks passes validation (Req 4.5)", () => {
    fc.assert(
      fc.property(fc.array(validAtomicTaskArb, { minLength: 1, maxLength: 10 }), (tasks) => {
        expect(validatePlanTasks(tasks)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("plan with at least one invalid task fails validation (Req 4.5)", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(validAtomicTaskArb, { minLength: 0, maxLength: 3 }),
          taskWithMissingFieldArb,
          fc.array(validAtomicTaskArb, { minLength: 0, maxLength: 3 }),
        ),
        ([before, bad, after]) => {
          const tasks = [...before, bad, ...after];
          expect(validatePlanTasks(tasks)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("empty plan fails validation", () => {
    expect(validatePlanTasks([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scanForPlaceholders — dedicated tests
// ---------------------------------------------------------------------------

describe("scanForPlaceholders", () => {
  it("detects all forbidden placeholders in text (Req 4.4)", () => {
    fc.assert(
      fc.property(forbiddenPlaceholderArb, safeStringArb, (placeholder, surrounding) => {
        const text = `${surrounding} ${placeholder} ${surrounding}`;
        const found = scanForPlaceholders(text);
        expect(found.length).toBeGreaterThan(0);
        expect(found).toContain(placeholder);
      }),
      { numRuns: 200 },
    );
  });

  it("returns empty array for clean text (Req 4.4)", () => {
    fc.assert(
      fc.property(safeStringArb, (text) => {
        const found = scanForPlaceholders(text);
        expect(found).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("is case-insensitive for placeholder detection (Req 4.4)", () => {
    fc.assert(
      fc.property(forbiddenPlaceholderArb, (placeholder) => {
        // Test uppercase, lowercase, and mixed case
        const upper = scanForPlaceholders(placeholder.toUpperCase());
        const lower = scanForPlaceholders(placeholder.toLowerCase());

        expect(upper.length).toBeGreaterThan(0);
        expect(lower.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });
});
