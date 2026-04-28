/**
 * Resume engine — core logic extracted from forge-resume/SKILL.md.
 *
 * Implements:
 *   - generateResumeOutput: Produces the five-question recovery output
 *
 * Property 16: Resume 五问题完整输出
 *   - Given valid plan, progress, and findings, output must contain
 *     answers to all 5 questions:
 *     1. What problem are we solving? (plan Objective)
 *     2. Where are we now? (progress "in progress" items)
 *     3. What do we know? (findings)
 *     4. What's next? (plan Task Breakdown)
 *     5. What's blocking? (progress blockers)
 *   **Validates: Requirements 12.2**
 */
export interface PlanContext {
    /** The objective / problem statement from the plan. */
    objective: string;
    /** Ordered list of tasks from the plan's Task Breakdown. */
    tasks: string[];
}
export interface ProgressContext {
    /** Tasks marked as completed. */
    completedTasks: string[];
    /** Tasks currently in progress. */
    inProgressTasks: string[];
    /** Items listed as blockers. */
    blockers: string[];
}
export interface FindingsContext {
    /** Findings from research / execution phases. */
    findings: string[];
}
export interface ProjectState {
    plan: PlanContext;
    progress: ProgressContext;
    findings: FindingsContext;
}
export interface ResumeQuestion {
    question: string;
    answer: string;
}
export interface ResumeOutput {
    questions: ResumeQuestion[];
    /** The task to auto-locate to (if any). */
    autoLocateTask: string | null;
}
/**
 * Generate the five-question resume output from a project state.
 *
 * Per SKILL.md §2 and design Property 16:
 *   Q1: What problem? → plan.objective
 *   Q2: Current step? → progress.inProgressTasks
 *   Q3: Known findings? → findings.findings
 *   Q4: What's next? → next task from plan.tasks after current
 *   Q5: Blockers? → progress.blockers
 *
 * The output always contains exactly 5 questions with non-empty answers.
 */
export declare function generateResumeOutput(state: ProjectState): ResumeOutput;
