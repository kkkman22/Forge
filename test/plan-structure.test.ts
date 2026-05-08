import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SplitTriggerResult } from "../src/plan.js";
import { checkPlanStructure } from "../src/plan.js";

describe("checkPlanStructure", () => {
  it("split-trigger-task-count: 16 tasks triggers warning", () => {
    const tasks = Array.from({ length: 16 }, (_, i) => ({
      id: String(i + 1),
      name: `Task ${i + 1}`,
    }));
    const result: SplitTriggerResult = checkPlanStructure(tasks, [], "");
    expect(result.triggered).toBe(true);
    expect(result.reasons).toContain("任务数 > 15");
  });

  it("split-trigger-sprint-headings: 2 Sprint headings triggers warning", () => {
    const headings = ["### Sprint 1 — Foundation", "### Sprint 2 — Core", "## Other Section"];
    const result = checkPlanStructure([], headings, "");
    expect(result.triggered).toBe(true);
    expect(result.reasons).toContain("多 Sprint 分组");
  });

  it("split-trigger-delivery-task-name: delivery task name triggers warning", () => {
    const tasks = [{ id: "1", name: "Sprint 6 回归" }];
    const result = checkPlanStructure(tasks, [], "");
    expect(result.triggered).toBe(true);
    expect(result.reasons).toContain("含交付类任务");
  });

  it("split-trigger-chained-deps: chained Sprint dependency triggers warning", () => {
    const strategy = "Sprint 3 依赖 Sprint 2 的流处理模块";
    const result = checkPlanStructure([], [], strategy);
    expect(result.triggered).toBe(true);
    expect(result.reasons).toContain("链式 Sprint 依赖");
  });

  it("no-trigger-small-plan: 5 tasks, 0 Sprints does not trigger", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: String(i + 1),
      name: `Task ${i + 1}`,
    }));
    const result = checkPlanStructure(tasks, [], "Sequential execution");
    expect(result.triggered).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("monolith-acknowledged-bypass: checkPlanStructure still triggers but caller skips warning", () => {
    const tasks = Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1),
      name: `Task ${i + 1}`,
    }));
    const result = checkPlanStructure(tasks, [], "");
    expect(result.triggered).toBe(true);
    // Caller checks monolith_acknowledged separately
  });

  describe("real-world fixture", () => {
    const fixturePath = path.join(__dirname, "fixtures", "real-cases", "monolith-plan.md");

    it("triggers on real monolith plan fixture", () => {
      const content = fs.readFileSync(fixturePath, "utf-8");

      const taskPattern = /^- \[ \] (\d+\.\d+) (.+)$/gm;
      const tasks: Array<{ id: string; name: string }> = [];
      for (
        let match = taskPattern.exec(content);
        match !== null;
        match = taskPattern.exec(content)
      ) {
        tasks.push({ id: match[1], name: match[2] });
      }

      const headings = content.split("\n").filter((line) => /^###\s+/.test(line));

      const strategyMatch = content.match(/## Execution Strategy\n\n([\s\S]+)$/);
      const strategy = strategyMatch ? strategyMatch[1] : "";

      const result = checkPlanStructure(tasks, headings, strategy);

      expect(result.triggered).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    });
  });
});
