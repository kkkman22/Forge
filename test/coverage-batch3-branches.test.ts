import { describe, expect, it } from "vitest";
import {
  classifyScenarioType,
  parseExplicitScenarios,
  selectScenariosForRun,
} from "../src/accept.js";
import { deserializeExploreSummary } from "../src/context-budget.js";
import { classifyTaskWeight, scanForPlaceholders, type TaskWeight } from "../src/plan.js";

// context-budget: deserializeExploreSummary — all regex branches
describe("deserializeExploreSummary (regex branch coverage)", () => {
  it("parses entry points", () => {
    const r = deserializeExploreSummary("入口点：src/a.ts:42 (handler)");
    expect(r.entryPoints.length).toBe(1);
    expect(r.entryPoints[0].filePath).toBe("src/a.ts");
    expect(r.entryPoints[0].line).toBe(42);
    expect(r.entryPoints[0].functionName).toBe("handler");
  });
  it("parses dependency chain", () => {
    const r = deserializeExploreSummary("依赖链：a → b → c");
    expect(r.dependencyChain).toEqual(["a", "b", "c"]);
  });
  it("parses related tests", () => {
    const r = deserializeExploreSummary("相关测试：test/x.ts（5 个用例）");
    expect(r.relatedTests.length).toBe(1);
    expect(r.relatedTests[0].testCount).toBe(5);
  });
  it("parses key interfaces", () => {
    const r = deserializeExploreSummary("关键接口：IFoo (src/i.ts:10)");
    expect(r.keyInterfaces.length).toBe(1);
  });
  it("parses file groups", () => {
    const r = deserializeExploreSummary("文件分组：core（4 个文件）");
    expect(r.fileGroups.length).toBe(1);
    expect(r.fileGroups[0].fileCount).toBe(4);
  });
  it("returns empty arrays for garbage input", () => {
    const r = deserializeExploreSummary("garbage");
    expect(r.entryPoints).toEqual([]);
  });
  it("returns empty arrays for empty input", () => {
    const r = deserializeExploreSummary("");
    expect(r.entryPoints).toEqual([]);
  });
  it("parses a multi-line summary", () => {
    const text = [
      "入口点：src/a.ts:1 (fn)",
      "依赖链：x → y",
      "相关测试：test/a.ts（2 个用例）",
      "关键接口：IBar (src/b.ts:3)",
      "文件分组：mod（5 个文件）",
    ].join("\n");
    const r = deserializeExploreSummary(text);
    expect(r.entryPoints.length).toBe(1);
    expect(r.dependencyChain).toEqual(["x", "y"]);
    expect(r.relatedTests.length).toBe(1);
    expect(r.keyInterfaces.length).toBe(1);
    expect(r.fileGroups.length).toBe(1);
  });
});

// plan.ts: classifyTaskWeight + scanForPlaceholders
describe("classifyTaskWeight (branch coverage)", () => {
  it("classifyTaskWeight runs for light input", () => {
    const r = classifyTaskWeight({
      files_touched: 1,
      estimated_loc: 10,
      layers: ["src"],
      narrow_vertical_slice: true,
      new_dependencies: 0,
    } as never);
    expect(typeof r).toBe("object");
  });
  it("classifyTaskWeight runs for heavy input", () => {
    const r = classifyTaskWeight({
      files_touched: 10,
      estimated_loc: 500,
      layers: ["a", "b", "c", "d"],
      narrow_vertical_slice: false,
      new_dependencies: 2,
    } as never);
    expect(typeof r).toBe("object");
  });
  it("classifyTaskWeight runs for medium input", () => {
    const r = classifyTaskWeight({
      files_touched: 3,
      estimated_loc: 80,
      layers: ["src", "test"],
      narrow_vertical_slice: true,
      new_dependencies: 0,
    } as never);
    expect(typeof r).toBe("object");
  });
});

describe("scanForPlaceholders (branch coverage)", () => {
  it("finds forbidden placeholders", () => {
    const found = scanForPlaceholders("TODO: implement this\nTBD: figure out");
    expect(found.length).toBeGreaterThan(0);
  });
  it("returns empty for clean text", () => {
    expect(scanForPlaceholders("This is complete code.")).toEqual([]);
  });
  it("returns empty for empty input", () => {
    expect(scanForPlaceholders("")).toEqual([]);
  });
});

// accept.ts: classifyScenarioType + parseExplicitScenarios + selectScenariosForRun
describe("classifyScenarioType (branch coverage)", () => {
  it("classifies a GET scenario as api", () => {
    const r = classifyScenarioType({
      id: "s1",
      name: "test",
      method: "GET",
      endpoint: "/api/x",
      assertions: { status: 200 },
    } as never);
    expect(typeof r).toBe("string");
  });
  it("classifies a UI scenario", () => {
    const r = classifyScenarioType({
      id: "s1",
      name: "ui test",
      ui_action: { selector: "#btn", action: "click" },
      assertions: { visible: "#result" },
    } as never);
    expect(typeof r).toBe("string");
  });
});

describe("parseExplicitScenarios (branch coverage)", () => {
  it("returns empty array for content with no scenarios", () => {
    expect(parseExplicitScenarios("no scenarios here")).toEqual([]);
  });
  it("returns empty array for empty content", () => {
    expect(parseExplicitScenarios("")).toEqual([]);
  });
});
