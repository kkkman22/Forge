/**
 * P2 R7 (缺陷1): shouldIsolateWorker wired into phase-worker-runtime strategy.
 *
 * shouldIsolateWorker existed but had zero callers (dead code). Wire it into a
 * worker-strategy selector consumed by phase-worker-runtime callers: given
 * governance + tier, pick "isolate" (spawn a worker) vs "inline" (run in the
 * main agent). Capability-driven: GLM-5.2 Long Horizon → inline on Full tier;
 * Claude → isolate on Full/Standard.
 *
 * Validates: requirement R7 (real consumer, not dead code).
 */
import { describe, expect, it } from "vitest";
import { CLAUDE_CAPABILITIES, GLM52_CAPABILITIES } from "../../src/host/capabilities";
import { deriveGovernance } from "../../src/host/governance";
import { selectWorkerStrategy } from "../../src/host/worker-isolation";

const claudeGov = deriveGovernance(CLAUDE_CAPABILITIES, {});
const glm52Gov = deriveGovernance(GLM52_CAPABILITIES, {});

describe("selectWorkerStrategy — capability-driven (real consumer)", () => {
  it("Claude Full tier → isolate (spawn worker)", () => {
    expect(selectWorkerStrategy(claudeGov, "full")).toBe("isolate");
  });
  it("Claude Standard tier → isolate", () => {
    expect(selectWorkerStrategy(claudeGov, "standard")).toBe("isolate");
  });
  it("Claude Light tier → inline (no worker for single-file change)", () => {
    expect(selectWorkerStrategy(claudeGov, "light")).toBe("inline");
  });
  it("GLM-5.2 Full tier → inline (Long Horizon retains judgement, skip fork)", () => {
    expect(selectWorkerStrategy(glm52Gov, "full")).toBe("inline");
  });
  it("GLM-5.2 Standard tier → inline", () => {
    expect(selectWorkerStrategy(glm52Gov, "standard")).toBe("inline");
  });
  it("future Claude 1M Full tier → inline (V13, zero code change)", () => {
    const futureGov = deriveGovernance({ ...GLM52_CAPABILITIES }, {});
    expect(selectWorkerStrategy(futureGov, "full")).toBe("inline");
  });
});
