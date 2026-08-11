import { describe, expect, it } from "vitest";
import {
  type AlreadyTriggered,
  formatInlineGrillInjection,
  renderInlineGrillAdvisory,
  renderInlineGrillConfirmPrompt,
  shouldTriggerInlineGrill,
} from "../src/grill-inline.js";

const freshTriggered: AlreadyTriggered = {
  spec_high_ambiguity: false,
  decide_requirement_disagreement: false,
  decide_user_hesitation: false,
};

describe("shouldTriggerInlineGrill", () => {
  it("triggers for interactive + fresh state + spec_high_ambiguity", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "spec_high_ambiguity",
      alreadyTriggered: freshTriggered,
    });
    expect(result.trigger).toBe(true);
    expect(result.rationale).toContain("spec_high_ambiguity");
  });

  it("skips for autonomous mode regardless of reason", () => {
    const result = shouldTriggerInlineGrill({
      mode: "autonomous",
      reason: "spec_high_ambiguity",
      alreadyTriggered: freshTriggered,
    });
    expect(result.trigger).toBe(false);
    expect(result.rationale).toBe("autonomous_mode");
  });

  it("skips when reason already triggered in this session", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "spec_high_ambiguity",
      alreadyTriggered: {
        ...freshTriggered,
        spec_high_ambiguity: true,
      },
    });
    expect(result.trigger).toBe(false);
    expect(result.rationale).toBe("frequency_limit");
  });

  it("triggers for interactive + decide_requirement_disagreement when fresh", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "decide_requirement_disagreement",
      alreadyTriggered: freshTriggered,
    });
    expect(result.trigger).toBe(true);
  });

  it("triggers for interactive + decide_user_hesitation when fresh", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "decide_user_hesitation",
      alreadyTriggered: freshTriggered,
    });
    expect(result.trigger).toBe(true);
  });

  it("independent reasons are tracked separately", () => {
    const result = shouldTriggerInlineGrill({
      mode: "interactive",
      reason: "decide_requirement_disagreement",
      alreadyTriggered: {
        ...freshTriggered,
        spec_high_ambiguity: true,
      },
    });
    expect(result.trigger).toBe(true);
  });
});

describe("renderInlineGrillConfirmPrompt", () => {
  it("renders Chinese prompt for spec_high_ambiguity", () => {
    const result = renderInlineGrillConfirmPrompt("spec_high_ambiguity");
    expect(result).toContain("检测到");
    expect(result).toContain("模糊");
    expect(result).toContain("grill");
  });

  it("renders Chinese prompt for decide_requirement_disagreement", () => {
    const result = renderInlineGrillConfirmPrompt("decide_requirement_disagreement");
    expect(result).toContain("需求侧");
    expect(result).toContain("grill");
  });

  it("renders Chinese prompt for decide_user_hesitation", () => {
    const result = renderInlineGrillConfirmPrompt("decide_user_hesitation");
    expect(result).toContain("犹豫");
    expect(result).toContain("grill");
  });
});

describe("renderInlineGrillAdvisory", () => {
  it("renders advisory with spec_high_ambiguity reason", () => {
    const result = renderInlineGrillAdvisory("spec_high_ambiguity");
    expect(result).toContain("spec_high_ambiguity");
    expect(result).toContain("autonomous");
    expect(result).toContain("/tinkerman grill");
  });

  it("renders advisory with decide_requirement_disagreement reason", () => {
    const result = renderInlineGrillAdvisory("decide_requirement_disagreement");
    expect(result).toContain("decide_requirement_disagreement");
    expect(result).toContain("/tinkerman grill");
  });

  it("renders advisory with decide_user_hesitation reason", () => {
    const result = renderInlineGrillAdvisory("decide_user_hesitation");
    expect(result).toContain("decide_user_hesitation");
  });
});

describe("formatInlineGrillInjection", () => {
  it("formats completed result for spec mode", () => {
    const result = formatInlineGrillInjection(
      { kind: "completed", tree: {}, alignmentSummary: "3 items clarified" },
      "spec",
    );
    expect(result).toContain("Inline Grill 对齐结果");
    expect(result).toContain("spec");
    expect(result).toContain("3 items clarified");
  });

  it("formats completed result for decide mode", () => {
    const result = formatInlineGrillInjection(
      { kind: "completed", tree: {}, alignmentSummary: "requirements aligned" },
      "decide",
    );
    expect(result).toContain("Inline Grill 对齐结果");
    expect(result).toContain("decide");
    expect(result).toContain("requirements aligned");
  });

  it("formats skipped result with reason", () => {
    const result = formatInlineGrillInjection({ kind: "skipped", reason: "user_declined" }, "spec");
    expect(result).toContain("跳过");
    expect(result).toContain("user_declined");
  });

  it("formats abandoned result", () => {
    const result = formatInlineGrillInjection({ kind: "abandoned", partialTree: {} }, "decide");
    expect(result).toContain("中止");
  });
});

describe("grill-inline barrel exports", () => {
  it("re-exports shouldTriggerInlineGrill from index", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.shouldTriggerInlineGrill).toBe("function");
  });

  it("re-exports renderInlineGrillConfirmPrompt from index", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.renderInlineGrillConfirmPrompt).toBe("function");
  });

  it("re-exports renderInlineGrillAdvisory from index", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.renderInlineGrillAdvisory).toBe("function");
  });

  it("re-exports formatInlineGrillInjection from index", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.formatInlineGrillInjection).toBe("function");
  });
});
