import { describe, expect, it } from "vitest";
import { shouldBlockShip } from "../src/accept-gate.js";
import type { EnabledPacks } from "../src/pack/types.js";

function makePacks(flags: Record<string, unknown> = {}): EnabledPacks {
  return {
    order: ["pms"],
    entries: [
      {
        name: "pms",
        displayName: "PMS Pack",
        description: "test",
        forgeMinVersion: "2.4.0",
        dependsOn: [],
        extends: {},
        featureFlags: flags,
        manifestPath: "/packs/pms/pack.yaml",
        rootPath: "/packs/pms",
      },
    ],
    customLayerRoot: "/.tinkerman/custom",
  };
}

const emptyPacks: EnabledPacks = {
  order: [],
  entries: [],
  customLayerRoot: "/.tinkerman/custom",
};

const specWithScenarios = {
  filePath: "spec.md",
  frontmatter: { context: "reservations" },
  body: "## Scenarios\n\nScenario: test",
};

const specNoScenarios = {
  filePath: "spec.md",
  frontmatter: { context: "reservations" },
  body: "## Other section\n\nSome content",
};

const specNoContext = {
  filePath: "spec.md",
  frontmatter: {},
  body: "## Scenarios\n\nScenario: test",
};

describe("shouldBlockShip", () => {
  it("returns no-block when context not in forced_acceptance_contexts", () => {
    const result = shouldBlockShip({
      spec: specWithScenarios,
      enabledPacks: makePacks({ forced_acceptance_contexts: ["folio-billing"] }),
      acceptanceArtifactPath: null,
    });
    expect(result.block).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it("returns no-block + warning when context in forced list but spec has no Scenarios", () => {
    const result = shouldBlockShip({
      spec: specNoScenarios,
      enabledPacks: makePacks({ forced_acceptance_contexts: ["reservations"] }),
      acceptanceArtifactPath: null,
    });
    expect(result.block).toBe(false);
    expect(result.warning).toBeDefined();
  });

  it("returns block when context forced + has Scenarios + no artifact", () => {
    const result = shouldBlockShip({
      spec: specWithScenarios,
      enabledPacks: makePacks({ forced_acceptance_contexts: ["reservations"] }),
      acceptanceArtifactPath: null,
    });
    expect(result.block).toBe(true);
    expect(result.reason).toContain("Acceptance");
  });

  it("returns block when context forced + has Scenarios + artifact has fail > 0", () => {
    const result = shouldBlockShip({
      spec: specWithScenarios,
      enabledPacks: makePacks({ forced_acceptance_contexts: ["reservations"] }),
      acceptanceArtifactPath: ".tinkerman/acceptance/topic/report.md",
      artifactContent: "---\nverdicts_summary:\n  pass: 3\n  fail: 2\n  skip: 0\n---\n",
    });
    expect(result.block).toBe(true);
    expect(result.reason).toContain("FAIL");
  });

  it("returns no-block when context forced + has Scenarios + all pass", () => {
    const result = shouldBlockShip({
      spec: specWithScenarios,
      enabledPacks: makePacks({ forced_acceptance_contexts: ["reservations"] }),
      acceptanceArtifactPath: ".tinkerman/acceptance/topic/report.md",
      artifactContent: "---\nverdicts_summary:\n  pass: 5\n  fail: 0\n  skip: 0\n---\n",
    });
    expect(result.block).toBe(false);
  });

  it("returns no-block when enabledPacks empty (Zero-Pack-Zero-Impact)", () => {
    const result = shouldBlockShip({
      spec: specWithScenarios,
      enabledPacks: emptyPacks,
      acceptanceArtifactPath: null,
    });
    expect(result.block).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("returns no-block when spec has no context field", () => {
    const result = shouldBlockShip({
      spec: specNoContext,
      enabledPacks: makePacks({ forced_acceptance_contexts: ["reservations"] }),
      acceptanceArtifactPath: null,
    });
    expect(result.block).toBe(false);
  });
});
