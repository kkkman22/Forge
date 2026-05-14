import { describe, it, expect } from "vitest";
import {
  shouldTriggerInlineGrill,
  type AlreadyTriggered,
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
