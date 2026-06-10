/**
 * Property 16: Resume 五问题完整输出
 *
 * Uses fast-check to generate project states with valid plan, progress,
 * and findings, verifying that the resume output contains answers to
 * all 5 questions.
 *
 * **Validates: Requirements 12.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type FindingsContext,
  generateResumeOutput,
  type PlanContext,
  type ProgressContext,
  type ProjectState,
} from "../src/resume.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A non-empty task name. */
const taskNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 3, maxLength: 40 })
  .filter((s) => s.trim().length >= 3);

/** A non-empty objective string. */
const objectiveArb: fc.Arbitrary<string> = fc
  .string({ minLength: 5, maxLength: 100 })
  .filter((s) => s.trim().length >= 5);

/** A non-empty finding string. */
const findingArb: fc.Arbitrary<string> = fc
  .string({ minLength: 3, maxLength: 60 })
  .filter((s) => s.trim().length >= 3);

/** A plan context with objective and tasks. */
const planContextArb: fc.Arbitrary<PlanContext> = fc
  .tuple(objectiveArb, fc.array(taskNameArb, { minLength: 1, maxLength: 10 }))
  .filter(([, tasks]) => new Set(tasks).size === tasks.length)
  .map(([objective, tasks]) => ({ objective, tasks }));

/**
 * A progress context derived from a plan's task list.
 * Ensures completed + inProgress tasks are subsets of plan tasks.
 */
const progressContextFromPlanArb = (plan: PlanContext): fc.Arbitrary<ProgressContext> => {
  const taskCount = plan.tasks.length;
  return fc
    .tuple(
      fc.integer({ min: 0, max: taskCount }),
      fc.integer({ min: 0, max: Math.min(1, taskCount) }),
      fc.array(
        fc.string({ minLength: 3, maxLength: 30 }).filter((s) => s.trim().length >= 3),
        { minLength: 0, maxLength: 3 },
      ),
    )
    .map(([completedCount, inProgressCount, blockers]) => {
      const safeCompleted = Math.min(completedCount, taskCount);
      const safeInProgress = Math.min(inProgressCount, taskCount - safeCompleted);

      return {
        completedTasks: plan.tasks.slice(0, safeCompleted),
        inProgressTasks: plan.tasks.slice(safeCompleted, safeCompleted + safeInProgress),
        blockers,
      };
    });
};

/** A findings context. */
const findingsContextArb: fc.Arbitrary<FindingsContext> = fc
  .array(findingArb, { minLength: 0, maxLength: 5 })
  .map((findings) => ({ findings }));

/** A non-empty findings context (at least one finding). */
const nonEmptyFindingsArb: fc.Arbitrary<FindingsContext> = fc
  .array(findingArb, { minLength: 1, maxLength: 5 })
  .map((findings) => ({ findings }));

/** A complete project state with valid plan, progress, and findings. */
const projectStateArb: fc.Arbitrary<ProjectState> = planContextArb.chain((plan) =>
  fc
    .tuple(progressContextFromPlanArb(plan), findingsContextArb)
    .map(([progress, findings]) => ({ plan, progress, findings })),
);

/** A project state with non-empty findings. */
const projectStateWithFindingsArb: fc.Arbitrary<ProjectState> = planContextArb.chain((plan) =>
  fc
    .tuple(progressContextFromPlanArb(plan), nonEmptyFindingsArb)
    .map(([progress, findings]) => ({ plan, progress, findings })),
);

/** A project state where some tasks are in progress. */
const projectStateWithInProgressArb: fc.Arbitrary<ProjectState> = planContextArb
  .filter((plan) => plan.tasks.length >= 2)
  .chain((plan) =>
    fc
      .tuple(
        fc.integer({ min: 0, max: plan.tasks.length - 1 }),
        findingsContextArb,
        fc.array(
          fc.string({ minLength: 3, maxLength: 30 }).filter((s) => s.trim().length >= 3),
          { minLength: 0, maxLength: 3 },
        ),
      )
      .map(([completedCount, findings, blockers]) => ({
        plan,
        progress: {
          completedTasks: plan.tasks.slice(0, completedCount),
          inProgressTasks: [plan.tasks[completedCount]],
          blockers,
        },
        findings,
      })),
  );

// ---------------------------------------------------------------------------
// Property 16: Resume 五问题完整输出
// ---------------------------------------------------------------------------

describe("Property 16: Resume 五问题完整输出", () => {
  it("output always contains exactly 5 questions (Req 12.2)", () => {
    fc.assert(
      fc.property(projectStateArb, (state) => {
        const output = generateResumeOutput(state);

        expect(output.questions).toHaveLength(5);
      }),
      { numRuns: 50 },
    );
  });

  it("all 5 questions have non-empty answers (Req 12.2)", () => {
    fc.assert(
      fc.property(projectStateArb, (state) => {
        const output = generateResumeOutput(state);

        for (const q of output.questions) {
          expect(q.question.length).toBeGreaterThan(0);
          expect(q.answer.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("Q1 contains the plan objective (Req 12.2)", () => {
    fc.assert(
      fc.property(projectStateArb, (state) => {
        const output = generateResumeOutput(state);

        expect(output.questions[0].question).toContain("正在解决什么问题");
        expect(output.questions[0].answer).toBe(state.plan.objective);
      }),
      { numRuns: 50 },
    );
  });

  it("Q2 reflects in-progress tasks from progress (Req 12.2)", () => {
    fc.assert(
      fc.property(projectStateWithInProgressArb, (state) => {
        const output = generateResumeOutput(state);

        expect(output.questions[1].question).toContain("当前在哪一步");
        // Answer should contain the in-progress task names
        for (const task of state.progress.inProgressTasks) {
          expect(output.questions[1].answer).toContain(task);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("Q3 reflects findings (Req 12.2)", () => {
    fc.assert(
      fc.property(projectStateWithFindingsArb, (state) => {
        const output = generateResumeOutput(state);

        expect(output.questions[2].question).toContain("已知发现");
        for (const finding of state.findings.findings) {
          expect(output.questions[2].answer).toContain(finding);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("Q3 shows fallback when no findings (Req 12.2)", () => {
    fc.assert(
      fc.property(
        planContextArb.chain((plan) =>
          progressContextFromPlanArb(plan).map((progress) => ({
            plan,
            progress,
            findings: { findings: [] },
          })),
        ),
        (state) => {
          const output = generateResumeOutput(state);

          expect(output.questions[2].answer).toBe("暂无发现");
        },
      ),
      { numRuns: 50 },
    );
  });

  it("Q4 identifies the next task from plan (Req 12.2)", () => {
    fc.assert(
      fc.property(projectStateArb, (state) => {
        const output = generateResumeOutput(state);

        expect(output.questions[3].question).toContain("下一步是什么");
        // Answer should be non-empty (either a task name or "所有任务已完成")
        expect(output.questions[3].answer.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });

  it("Q5 reflects blockers from progress (Req 12.2)", () => {
    fc.assert(
      fc.property(projectStateArb, (state) => {
        const output = generateResumeOutput(state);

        expect(output.questions[4].question).toContain("有什么阻塞");
        if (state.progress.blockers.length > 0) {
          for (const blocker of state.progress.blockers) {
            expect(output.questions[4].answer).toContain(blocker);
          }
        } else {
          expect(output.questions[4].answer).toBe("无阻塞");
        }
      }),
      { numRuns: 50 },
    );
  });

  it("auto-locate points to in-progress task when available (Req 12.3)", () => {
    fc.assert(
      fc.property(projectStateWithInProgressArb, (state) => {
        const output = generateResumeOutput(state);

        expect(output.autoLocateTask).toBe(state.progress.inProgressTasks[0]);
      }),
      { numRuns: 50 },
    );
  });

  it("questions cover all 5 required topics (Req 12.2)", () => {
    fc.assert(
      fc.property(projectStateArb, (state) => {
        const output = generateResumeOutput(state);
        const questionTexts = output.questions.map((q) => q.question);

        expect(questionTexts).toContainEqual(expect.stringContaining("正在解决什么问题"));
        expect(questionTexts).toContainEqual(expect.stringContaining("当前在哪一步"));
        expect(questionTexts).toContainEqual(expect.stringContaining("已知发现"));
        expect(questionTexts).toContainEqual(expect.stringContaining("下一步是什么"));
        expect(questionTexts).toContainEqual(expect.stringContaining("有什么阻塞"));
      }),
      { numRuns: 50 },
    );
  });
});

describe("resume execution metadata summary", () => {
  it("includes compact execution metadata when present", () => {
    const output = generateResumeOutput({
      plan: { objective: "Ship metadata persistence", tasks: ["Task 1", "Task 2"] },
      progress: { completedTasks: [], inProgressTasks: ["Task 1"], blockers: [] },
      findings: { findings: [] },
      executionMetadata: {
        claude_version: "2.1.169",
        dispatch_mode: "agents",
        diagnostic_mode: true,
        tier: "standard",
        branch: "forge/claude-2-1-169-inspired-hardening",
      },
    });

    expect(output.questions[1].answer).toContain("metadata:");
    expect(output.questions[1].answer).toContain("claude=2.1.169");
    expect(output.questions[1].answer).toContain("dispatch=agents");
    expect(output.questions[1].answer).toContain("diagnostic=true");
    expect(output.questions[1].answer).toContain("branch=forge/claude-2-1-169-inspired-hardening");
  });
});
