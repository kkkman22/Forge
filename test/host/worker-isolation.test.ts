/**
 * P2 R7 (项3): capability-driven worker isolation decision.
 *
 * The decision to isolate a phase behind a worker was previously a hardcoded
 * tier rule (Full/Standard → worker). P2 derives it from governance: when the
 * model supports Long Horizon (cross-task judgement retention), worker
 * isolation becomes optional even on Full tier — the model keeps coherence
 * without the fork boundary. Claude (200K, no Long Horizon) keeps required.
 *
 * Validates: design.md R7 — worker isolation consumer integration.
 */
import { describe, expect, it } from "vitest";
import { CLAUDE_CAPABILITIES, GLM52_CAPABILITIES } from "../../src/host/capabilities";
import { deriveGovernance } from "../../src/host/governance";
import { shouldIsolateWorker } from "../../src/host/worker-isolation";

const claudeGov = deriveGovernance(CLAUDE_CAPABILITIES, {});
const glm52Gov = deriveGovernance(GLM52_CAPABILITIES, {});

describe("shouldIsolateWorker — capability-driven", () => {
  it("Claude (required isolation): Full tier → isolate", () => {
    expect(shouldIsolateWorker(claudeGov, "full")).toBe(true);
  });

  it("Claude (required isolation): Standard tier → isolate", () => {
    expect(shouldIsolateWorker(claudeGov, "standard")).toBe(true);
  });

  it("Claude (required isolation): Light tier → never isolate (no worker)", () => {
    expect(shouldIsolateWorker(claudeGov, "light")).toBe(false);
  });

  it("GLM-5.2 (optional isolation): Full tier → may skip (Long Horizon retains judgement)", () => {
    // optional means the caller MAY inline on Full tier; the decision function
    // returns false (do not force isolation) — caller can still opt in.
    expect(shouldIsolateWorker(glm52Gov, "full")).toBe(false);
  });

  it("GLM-5.2 (optional isolation): Standard tier → skip", () => {
    expect(shouldIsolateWorker(glm52Gov, "standard")).toBe(false);
  });

  it("GLM-5.2: Light tier → never isolate", () => {
    expect(shouldIsolateWorker(glm52Gov, "light")).toBe(false);
  });

  it("future Claude 1M (optional): Full tier auto-relaxes (V13 worker dimension)", () => {
    const future1MGov = deriveGovernance({ ...GLM52_CAPABILITIES, contextWindow: 1_000_000 }, {});
    expect(shouldIsolateWorker(future1MGov, "full")).toBe(false);
  });
});
