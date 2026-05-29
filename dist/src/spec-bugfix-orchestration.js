/**
 * Bugfix orchestration — generates bugfix design and tasks from a BugfixDocument.
 *
 * Skips variant detection and brownfield checks (bugfix-specific flow).
 * Preserves spec leak detection in lenient mode.
 *
 * Validates: Requirement 14
 */
import { isBugfixBundle } from "./spec-bundle.js";
import { derivePbtTasksFromUnchanged } from "./spec-pbt-derivation.js";
/**
 * Run bugfix orchestration: bugfix → design → tasks three-step pipeline.
 * Skips variant/brownfield detection; uses lenient spec leak mode.
 */
export function runBugfixOrchestration(bundle) {
    if (!isBugfixBundle(bundle)) {
        return {
            steps: [],
            variantDetection: false,
            brownfieldDetection: false,
            specLeakMode: "lenient",
        };
    }
    const doc = bundle.primary;
    const fm = doc.frontmatter;
    // Step 1: Bugfix document (already locked as primary)
    const bugfixStep = {
        phase: "bugfix",
        status: "locked",
        document: doc,
    };
    // Step 2: Generate design from bugfix
    const designFm = { ...fm, kind: "bugfix" };
    const design = {
        frontmatter: designFm,
        rootCause: `[待分析] ${doc.current.map((c) => c.shall).join("; ")}`,
        fixStrategy: `[待规划] 修复 ${doc.expected.map((e) => e.shall).join("; ")}`,
        testProperties: generateTestProperties(doc),
    };
    const designStep = {
        phase: "design",
        status: "draft",
        document: design,
    };
    // Step 3: Generate tasks from unchanged + fix tasks
    const fixTask = {
        id: "BFX-01",
        title: "Fix root cause",
        goal: `修复: ${doc.current[0]?.shall ?? "unknown"} → ${doc.expected[0]?.shall ?? "unknown"}`,
        related_requirements: [],
        status: "pending",
        category: "implementation",
    };
    const pbtTasks = derivePbtTasksFromUnchanged(bundle);
    const allTasks = [fixTask, ...pbtTasks];
    const tasksDoc = {
        frontmatter: { ...fm, kind: "bugfix" },
        tasks: allTasks,
    };
    const tasksStep = {
        phase: "tasks",
        status: "draft",
        document: tasksDoc,
    };
    return {
        steps: [bugfixStep, designStep, tasksStep],
        variantDetection: false,
        brownfieldDetection: false,
        specLeakMode: "lenient",
    };
}
function generateTestProperties(doc) {
    const lines = [];
    for (const u of doc.unchanged) {
        lines.push(`- 当 ${u.when} 时 系统应当 ${u.shall} (regression)`);
    }
    for (const e of doc.expected) {
        lines.push(`- 当 ${e.when} 时 系统应当 ${e.shall} (fix verification)`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=spec-bugfix-orchestration.js.map