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
    validateDependencies,
    validatePlanTasks,
    validateSpecLocked,
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
      { numRuns: 50 },
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
      { numRuns: 50 },
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
      { numRuns: 50 },
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
      { numRuns: 50 },
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
      { numRuns: 50 },
    );
  });

  it("clean tasks without placeholders pass placeholder check (Req 4.4)", () => {
    fc.assert(
      fc.property(validAtomicTaskArb, (task) => {
        // Valid tasks are generated with safe strings — no placeholders
        const result = validateAtomicTask(task);
        expect(result.errors.some((e) => e.includes("forbidden placeholders"))).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  // -----------------------------------------------------------------------
  // (d) validatePlanTasks — all tasks must be valid
  // -----------------------------------------------------------------------

  it("plan with all valid tasks passes validation (Req 4.5)", () => {
    fc.assert(
      fc.property(fc.array(validAtomicTaskArb, { minLength: 1, maxLength: 10 }), (tasks) => {
        // Assign unique sequential task numbers so validators that key off
        // taskNumber (cycle detection / topological ordering) don't merge
        // distinct tasks. Generator independence is fine for shape testing
        // but validatePlanTasks treats duplicate taskNumbers as one node.
        const uniqueTasks = tasks.map((task, idx) => ({ ...task, taskNumber: idx + 1 }));
        expect(validatePlanTasks(uniqueTasks)).toBe(true);
      }),
      { numRuns: 50 },
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
      { numRuns: 50 },
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
      { numRuns: 50 },
    );
  });

  it("returns empty array for clean text (Req 4.4)", () => {
    fc.assert(
      fc.property(safeStringArb, (text) => {
        const found = scanForPlaceholders(text);
        expect(found).toHaveLength(0);
      }),
      { numRuns: 50 },
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
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// validateSpecLocked — R24 tests
// ---------------------------------------------------------------------------

describe("validateSpecLocked", () => {
  it('returns valid: true when specStatus is "locked"', () => {
    const result = validateSpecLocked("locked");
    expect(result).toEqual({ valid: true });
  });

  it('returns valid: false with "spec not locked" for non-locked statuses', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== "locked"),
        (status) => {
          const result = validateSpecLocked(status);
          expect(result).toEqual({ valid: false, error: "spec not locked" });
        },
      ),
      { numRuns: 40 },
    );
  });

  it('returns valid: false for "draft" status', () => {
    const result = validateSpecLocked("draft");
    expect(result).toEqual({ valid: false, error: "spec not locked" });
  });

  it("returns valid: false for empty string", () => {
    const result = validateSpecLocked("");
    expect(result).toEqual({ valid: false, error: "spec not locked" });
  });
});

// ---------------------------------------------------------------------------
// validateDependencies — R25 tests
// ---------------------------------------------------------------------------

describe("validateDependencies", () => {
  it("returns empty errors when no tasks have dependsOn", () => {
    fc.assert(
      fc.property(fc.array(validAtomicTaskArb, { minLength: 1, maxLength: 5 }), (tasks) => {
        // Ensure no dependsOn fields
        const tasksWithoutDeps = tasks.map(({ dependsOn, ...rest }) => rest) as AtomicTask[];
        const errors = validateDependencies(tasksWithoutDeps);
        expect(errors).toHaveLength(0);
      }),
      { numRuns: 40 },
    );
  });

  it("returns empty errors when all dependsOn references are valid", () => {
    const tasks: AtomicTask[] = [
      { ...makeMinimalTask(1), dependsOn: [] },
      { ...makeMinimalTask(2), dependsOn: [1] },
      { ...makeMinimalTask(3), dependsOn: [1, 2] },
    ];
    const errors = validateDependencies(tasks);
    expect(errors).toHaveLength(0);
  });

  it("returns errors when dependsOn references non-existent task", () => {
    const tasks: AtomicTask[] = [
      { ...makeMinimalTask(1) },
      { ...makeMinimalTask(2), dependsOn: [99] },
    ];
    const errors = validateDependencies(tasks);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Task 2");
    expect(errors[0]).toContain("non-existent task 99");
  });

  it("returns multiple errors for multiple invalid references", () => {
    const tasks: AtomicTask[] = [{ ...makeMinimalTask(1), dependsOn: [10, 20] }];
    const errors = validateDependencies(tasks);
    expect(errors).toHaveLength(2);
  });

  it("returns empty errors for empty task list", () => {
    const errors = validateDependencies([]);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validatePlanTasks — dependency integration
// ---------------------------------------------------------------------------

describe("validatePlanTasks with dependsOn", () => {
  it("fails when a task has an invalid dependency reference", () => {
    const tasks: AtomicTask[] = [makeMinimalTask(1), { ...makeMinimalTask(2), dependsOn: [99] }];
    expect(validatePlanTasks(tasks)).toBe(false);
  });

  it("passes when all dependency references are valid", () => {
    const tasks: AtomicTask[] = [makeMinimalTask(1), { ...makeMinimalTask(2), dependsOn: [1] }];
    expect(validatePlanTasks(tasks)).toBe(true);
  });

  it("passes when tasks have no dependsOn field", () => {
    const tasks: AtomicTask[] = [makeMinimalTask(1), makeMinimalTask(2)];
    expect(validatePlanTasks(tasks)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 10: dependsOn dependency validation
// ---------------------------------------------------------------------------

describe("Property 10: dependsOn dependency validation", () => {
  /**
   * Generator: a list of AtomicTask objects where every dependsOn reference
   * points to an existing taskNumber in the list. We assign unique sequential
   * task numbers, then for each task pick dependsOn from the set of all
   * assigned numbers (excluding self-references for realism, though the
   * validator doesn't enforce that).
   *
   * **Validates: Requirements 25.2, 25.3**
   */
  const tasksWithValidDepsArb: fc.Arbitrary<AtomicTask[]> = fc
    .array(validAtomicTaskArb, { minLength: 1, maxLength: 10 })
    .chain((baseTasks) => {
      // Assign unique sequential task numbers
      const taskNumbers = baseTasks.map((_, i) => i + 1);

      // For each task, generate a subset of existing task numbers as dependsOn
      const depArbs = baseTasks.map((task, idx) => {
        const otherNumbers = taskNumbers.filter((n) => n !== taskNumbers[idx]);
        if (otherNumbers.length === 0) {
          // Only one task — no possible deps
          return fc.constant({ ...task, taskNumber: taskNumbers[idx], dependsOn: [] as number[] });
        }
        return fc
          .subarray(otherNumbers, { minLength: 0, maxLength: otherNumbers.length })
          .map((deps) => ({ ...task, taskNumber: taskNumbers[idx], dependsOn: deps }));
      });

      return fc.tuple(...(depArbs as [fc.Arbitrary<AtomicTask>, ...fc.Arbitrary<AtomicTask>[]]));
    })
    .map((tuple) => [...tuple]);

  /**
   * Generator: a list of AtomicTask objects where at least one task has a
   * dependsOn reference to a taskNumber that does NOT exist in the list.
   * We generate a valid task list, then inject one invalid reference.
   */
  const tasksWithInvalidDepsArb: fc.Arbitrary<AtomicTask[]> = fc
    .tuple(
      fc.array(validAtomicTaskArb, { minLength: 1, maxLength: 8 }),
      fc.nat({ max: 50 }), // index selector for which task gets the bad dep
      fc.integer({ min: 1000, max: 9999 }), // non-existent task number
    )
    .map(([baseTasks, idxSeed, badDep]) => {
      // Assign unique sequential task numbers (1..N)
      const tasks = baseTasks.map((task, i) => ({
        ...task,
        taskNumber: i + 1,
      }));

      // Pick a task to inject the invalid dependency
      const targetIdx = idxSeed % tasks.length;

      // Ensure badDep doesn't accidentally match an existing task number
      const existingNumbers = new Set(tasks.map((t) => t.taskNumber));
      let invalidDep = badDep;
      while (existingNumbers.has(invalidDep)) {
        invalidDep++;
      }

      // Inject the invalid dependency
      tasks[targetIdx] = {
        ...tasks[targetIdx],
        dependsOn: [...(tasks[targetIdx].dependsOn ?? []), invalidDep],
      };

      return tasks;
    });

  it("returns empty errors when all dependsOn references point to existing task numbers", () => {
    fc.assert(
      fc.property(tasksWithValidDepsArb, (tasks) => {
        const errors = validateDependencies(tasks);
        expect(errors).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });

  it("returns non-empty errors when any dependsOn references a non-existent taskNumber", () => {
    fc.assert(
      fc.property(tasksWithInvalidDepsArb, (tasks) => {
        const errors = validateDependencies(tasks);
        expect(errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });

  it("each error message identifies the offending task and missing dependency", () => {
    fc.assert(
      fc.property(tasksWithInvalidDepsArb, (tasks) => {
        const errors = validateDependencies(tasks);
        // Every error should mention "Task" and "non-existent task"
        for (const err of errors) {
          expect(err).toMatch(/Task \d+/);
          expect(err).toMatch(/non-existent task \d+/);
        }
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Helper — minimal valid task for dependency tests
// ---------------------------------------------------------------------------

function makeMinimalTask(taskNumber: number): AtomicTask {
  return {
    taskNumber,
    title: `Task ${taskNumber}`,
    filePath: "src/example.ts",
    estimatedMinutes: 3,
    tddSteps: {
      red: {
        testFile: "test/example.test.ts",
        testCode: 'it("works", () => expect(true).toBe(true));',
        runCommand: "npx vitest run",
      },
      green: {
        sourceFile: "src/example.ts",
        sourceCode: "export function example() { return true; }",
        runCommand: "npx vitest run",
      },
      refactor: "Extract into module",
    },
    verifyCommand: "npx vitest run",
    commitMessage: "feat(example): add example",
  };
}
