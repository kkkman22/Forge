import { describe, expect, it } from "vitest";

import {
  DEFAULT_VERIFY_WHITELIST,
  parseTasks,
  runPlanPreflight,
} from "../../src/build/plan-preflight.js";

const VALID_TASK = `
### Task 1: Add feature
- **Goal**: add feature
- **File**: \`src/feature.ts\`
- **Depends On**: \`[]\`
- **Verify**: \`npx vitest run\`
- **Commit**: \`feat: add\`
`;

function plan(tasks: string): string {
  return `---
topic: test
status: approved
---

## Objective
test

## Task Breakdown
${tasks}

## Spec Coverage
| Requirement | Covering Tasks |
|-----------|---------|
| Requirement 1 | Task 1 |
`;
}

describe("parseTasks", () => {
  it("parses ### Task N and #### T-NN headings", () => {
    const text = `
### Task 1: First
- **File**: \`a.ts\`

#### T-02: Second
- **File**: \`b.ts\`
`;
    const tasks = parseTasks(text);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe("T-01");
    expect(tasks[0].title).toBe("First");
    expect(tasks[1].id).toBe("T-02");
    expect(tasks[1].file).toBe("b.ts");
  });

  it("extracts Depends On, File, Verify fields", () => {
    const tasks = parseTasks(`
### Task 1: X
- **File**: \`src/x.ts\`
- **Depends On**: \`[2, 3]\`
- **Verify Command**: \`npx vitest\`
`);
    expect(tasks[0].file).toBe("src/x.ts");
    expect(tasks[0].dependsOn).toEqual(["2", "3"]);
    expect(tasks[0].verify).toBe("npx vitest");
  });

  it("returns empty array when no task headings", () => {
    expect(parseTasks("no tasks here")).toEqual([]);
  });
});

describe("runPlanPreflight — R1 pass/block", () => {
  it("passes a clean plan", () => {
    const r = runPlanPreflight({ planText: plan(VALID_TASK) });
    expect(r.kind).toBe("pass");
  });

  it("returns fail with all violations listed at once", () => {
    const dirty = `
### Task 1: Bad
- **File**: \`src/a.ts\`
- **Depends On**: \`[]\`
- **Verify**: \`bash\`
先写实现再补测试
`;
    const r = runPlanPreflight({ planText: plan(dirty) });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.length).toBeGreaterThan(0);
    const rules = r.violations.map((v) => v.rule);
    expect(rules.some((x) => x.includes("R3.AC1"))).toBe(true);
  });
});

describe("runPlanPreflight — R2 internal conflicts", () => {
  it("R2.AC1 detects file deleted by one task referenced by another", () => {
    const text = `
## Task Breakdown
### Task 1: Remove old
- **File**: \`src/old.ts\`
- Operation: DELETE \`src/old.ts\`
- **Depends On**: \`[]\`
- **Verify**: \`npx vitest\`

### Task 2: Use old
- **File**: \`src/old.ts\`
- **Depends On**: \`[1]\`
- **Verify**: \`npx vitest\`

## Spec Coverage
| Requirement | Covering Tasks |
|---|---|
| R1 | Task 1 |
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R2.AC1"))).toBe(true);
  });

  it("R2.AC2 detects depends-on-future-task", () => {
    const text = `
## Task Breakdown
### Task 1: First
- **Depends On**: \`[2]\`
- **Verify**: \`npx vitest\`

### Task 2: Second
- **Depends On**: \`[]\`
- **Verify**: \`npx vitest\`
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R2.AC2"))).toBe(true);
  });

  it("R2.AC2 detects self-dependency cycle", () => {
    const text = `
## Task Breakdown
### Task 1: Self
- **Depends On**: \`[1]\`
- **Verify**: \`npx vitest\`
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R2.AC2") && v.rule.includes("循环"))).toBe(
      true,
    );
  });

  it("R2.AC3 detects Spec Coverage gap", () => {
    const text = `
## Task Breakdown
### Task 1: X
- **Verify**: \`npx vitest\`

## Spec Coverage
| Requirement | Covering Tasks |
|---|---|
| Requirement 2 |  |
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R2.AC3"))).toBe(true);
  });

  it("R2.AC4 detects non-whitelisted verify-by token", () => {
    const text = `
## Task Breakdown
### Task 1: X
- **Verify**: \`vitest:fakelevel\`
`;
    const r = runPlanPreflight({ planText: text, verifyWhitelist: DEFAULT_VERIFY_WHITELIST });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R2.AC4"))).toBe(true);
  });

  it("R2.AC4 allows free-form command (not a verify-by label)", () => {
    const text = `
## Task Breakdown
### Task 1: X
- **Verify**: \`npx vitest run test/x.test.ts\`
`;
    const r = runPlanPreflight({ planText: text });
    // free-form command is fine, not flagged
    const has404 = r.kind === "fail" && r.violations.some((v) => v.rule.includes("R2.AC4"));
    expect(has404).toBe(false);
  });

  it("R2.AC5 detects duplicate task titles", () => {
    const text = `
## Task Breakdown
### Task 1: Same Title
- **Verify**: \`npx vitest\`

### Task 2: Same Title
- **Verify**: \`npx vitest\`
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R2.AC5"))).toBe(true);
  });
});

describe("runPlanPreflight — R3 self-defeating instructions", () => {
  it("R3.AC1 detects TDD violation phrasing", () => {
    const text = `
## Task Breakdown
### Task 1: X
先写实现再补测试
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R3.AC1"))).toBe(true);
  });

  it("R3.AC2 detects skip-verification phrasing", () => {
    const text = `
## Task Breakdown
### Task 1: X
跳过 verify 直接交付
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R3.AC2"))).toBe(true);
  });

  it("R3.AC3 detects mid-step-confirmation phrasing", () => {
    const text = `
## Task Breakdown
### Task 1: X
完成后询问用户是否继续
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R3.AC3"))).toBe(true);
  });

  it("R3.AC4 detects missing RED step when GREEN present (full format)", () => {
    const text = `
## Task Breakdown
### Task 1: X
**GREEN** — write code
**Verify**: \`npx vitest\`
`;
    const r = runPlanPreflight({ planText: text });
    expect(r.kind).toBe("fail");
    if (r.kind !== "fail") throw new Error("expected fail");
    expect(r.violations.some((v) => v.rule.includes("R3.AC4"))).toBe(true);
  });
});

describe("runPlanPreflight — R4 exemption", () => {
  it("preflight-exempt comment suppresses a flagged rule", () => {
    const text = `
## Task Breakdown
### Task 1: X
先写实现再补测试
<!-- preflight-exempt: R3.AC1 reason: legacy migration script, tests added later in T-02 -->
`;
    const r = runPlanPreflight({ planText: text });
    // R3.AC1 exempted → may still pass (if no other violation)
    const has31 = r.kind === "fail" && r.violations.some((v) => v.rule.includes("R3.AC1"));
    expect(has31).toBe(false);
  });
});
