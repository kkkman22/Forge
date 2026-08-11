/**
 * PMS Pack integration tests.
 *
 * Validates that the PMS pack's YAML state machines load and validate,
 * property tests derive correctly, the accept gate enforces forced contexts,
 * and glossary files meet structural requirements.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AcceptGateInput } from "../../src/accept-gate.js";
import { shouldBlockShip } from "../../src/accept-gate.js";
import type { EnabledPacks, PackEntry } from "../../src/pack/types.js";
import {
  deriveStatePropertyTests,
  loadStateMachineDefinition,
  validateDefinition,
} from "../../src/state-machine/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PACK_ROOT = join(__dirname, "../../packs/pms");
const STATE_MACHINE_DIR = join(PACK_ROOT, "state-machines");
const GLOSSARY_DIR = join(PACK_ROOT, "glossary");

const STATE_MACHINE_FILES = [
  "reservation.yaml",
  "folio.yaml",
  "housekeeping-task.yaml",
  "room-status.yaml",
] as const;

const GLOSSARY_FILES = [
  "_shared.md",
  "reservations.md",
  "folio-billing.md",
  "front-desk.md",
  "housekeeping.md",
  "reporting.md",
  "channel-integration.md",
  "night-audit.md",
  "rate-inventory.md",
] as const;

/** Build a mock PackEntry with PMS feature flags. */
function makePmsPackEntry(): PackEntry {
  return {
    name: "pms",
    displayName: "Hotel PMS Domain Pack",
    description: "酒店前台管理系统（Property Management System）领域知识包",
    forgeMinVersion: "2.4.0",
    dependsOn: [],
    extends: {},
    featureFlags: {
      forced_acceptance_contexts: ["reservations", "folio-billing", "night-audit"],
      mutation_critical_modules: [
        "src/domain/folio/**/*.ts",
        "src/domain/night-audit/**/*.ts",
        "src/domain/pricing/**/*.ts",
        "src/domain/reservation/state/**/*.ts",
      ],
      mutation_score_threshold: 85,
      business_day_defaults: {
        cutoff_hour: 4,
        timezone: "Asia/Shanghai",
      },
    },
    manifestPath: join(PACK_ROOT, "pack.yaml"),
    rootPath: PACK_ROOT,
  };
}

/** Build mock EnabledPacks with PMS pack enabled. */
function makePmsEnabled(): EnabledPacks {
  return {
    order: ["pms"],
    entries: [makePmsPackEntry()],
    customLayerRoot: "/project/.tinkerman/custom",
  };
}

/** Count terms in a glossary YAML frontmatter. */
function countTermsInGlossary(content: string): number {
  // Terms are listed under `terms:` key in the YAML frontmatter
  const termsMatch = content.match(/^terms:\s*$/m);
  if (!termsMatch) return 0;
  const afterTerms = content.slice(termsMatch.index! + termsMatch[0].length);
  // Count lines starting with "  - term:" until a non-indented line
  const termLines = afterTerms.match(/^\s+- term:/gm);
  return termLines ? termLines.length : 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PMS Pack — State machine loading", () => {
  for (const file of STATE_MACHINE_FILES) {
    it(`${file} loads and validates successfully`, () => {
      const yaml = readFileSync(join(STATE_MACHINE_DIR, file), "utf-8");
      const def = loadStateMachineDefinition(yaml, file);

      // Basic structure
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.states.length).toBeGreaterThanOrEqual(2);
      expect(def.initial).toBeTruthy();
      expect(def.transitions.length).toBeGreaterThanOrEqual(1);

      // Validation passes
      const report = validateDefinition(def);
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
    });
  }
});

describe("PMS Pack — Property test derivation", () => {
  it("reservation.yaml derives property tests with expected structure", () => {
    const yaml = readFileSync(join(STATE_MACHINE_DIR, "reservation.yaml"), "utf-8");
    const def = loadStateMachineDefinition(yaml, "reservation.yaml");

    const code = deriveStatePropertyTests(def);

    // Must contain a describe block
    expect(code).toContain('describe("Reservation State Machine — derived properties"');

    // Must contain fc.assert calls for invariants
    expect(code).toMatch(/fc\.assert/);
    // Reservation has terminal states (CheckedOut, NoShow, Cancelled)
    expect(code).toContain('"CheckedOut"');
    expect(code).toContain("fc.constantFrom");

    // Must contain import statement
    expect(code).toContain('import fc from "fast-check"');
  });

  it("folio.yaml derives property tests for known invariant patterns", () => {
    const yaml = readFileSync(join(STATE_MACHINE_DIR, "folio.yaml"), "utf-8");
    const def = loadStateMachineDefinition(yaml, "folio.yaml");

    const code = deriveStatePropertyTests(def);

    expect(code).toContain('describe("Folio State Machine — derived properties"');
    expect(code).toMatch(/fc\.assert/);
    // Folio has "void_requires_authorization" which matches state_requires_condition template
    // The generated code uses "Void" derived from toPascal("void") in the transition name
    expect(code).toContain("ToVoid");
  });
});

describe("PMS Pack — Accept gate with PMS packs", () => {
  const enabled = makePmsEnabled();

  it("blocks ship for forced context with no acceptance artifact", () => {
    const input: AcceptGateInput = {
      spec: {
        filePath: "specs/reservations.md",
        frontmatter: { context: "reservations" },
        body: "## Scenarios\n- scenario 1\n- scenario 2",
      },
      enabledPacks: enabled,
      acceptanceArtifactPath: null,
    };
    const decision = shouldBlockShip(input);
    expect(decision.block).toBe(true);
    expect(decision.reason).toContain("Acceptance");
  });

  it("blocks ship for forced context with failed artifact", () => {
    const input: AcceptGateInput = {
      spec: {
        filePath: "specs/folio-billing.md",
        frontmatter: { context: "folio-billing" },
        body: "## Scenarios\n- scenario 1",
      },
      enabledPacks: enabled,
      acceptanceArtifactPath: ".forge/acceptance/latest.md",
      artifactContent: "---\nverdict: fail\nfail: 2\npass: 3\n---",
    };
    const decision = shouldBlockShip(input);
    expect(decision.block).toBe(true);
    expect(decision.reason).toContain("FAIL");
  });

  it("does not block for non-forced context", () => {
    const input: AcceptGateInput = {
      spec: {
        filePath: "specs/housekeeping.md",
        frontmatter: { context: "housekeeping" },
        body: "## Scenarios\n- scenario 1",
      },
      enabledPacks: enabled,
      acceptanceArtifactPath: null,
    };
    const decision = shouldBlockShip(input);
    expect(decision.block).toBe(false);
  });

  it("does not block when spec has no context in frontmatter", () => {
    const input: AcceptGateInput = {
      spec: {
        filePath: "specs/misc.md",
        frontmatter: {},
        body: "## Scenarios\n- scenario 1",
      },
      enabledPacks: enabled,
      acceptanceArtifactPath: null,
    };
    const decision = shouldBlockShip(input);
    expect(decision.block).toBe(false);
  });

  it("warns but does not block when forced context lacks Scenarios section", () => {
    const input: AcceptGateInput = {
      spec: {
        filePath: "specs/night-audit.md",
        frontmatter: { context: "night-audit" },
        body: "# Night Audit Spec\n\nSome content but no scenarios section.",
      },
      enabledPacks: enabled,
      acceptanceArtifactPath: null,
    };
    const decision = shouldBlockShip(input);
    expect(decision.block).toBe(false);
    expect(decision.warning).toBeTruthy();
    expect(decision.warning).toContain("no ## Scenarios");
  });
});

describe("PMS Pack — Glossary term consistency", () => {
  for (const file of GLOSSARY_FILES) {
    it(`${file} has valid frontmatter and >= 10 terms`, () => {
      const content = readFileSync(join(GLOSSARY_DIR, file), "utf-8");

      // Must start with YAML frontmatter
      expect(content.startsWith("---")).toBe(true);

      // Must have name and description in frontmatter
      expect(content).toMatch(/^name:\s+/m);
      expect(content).toMatch(/^description:\s+/m);

      // Must have terms section
      expect(content).toMatch(/^terms:\s*$/m);

      // Must have at least 10 terms per file
      const termCount = countTermsInGlossary(content);
      expect(termCount).toBeGreaterThanOrEqual(10);
    });
  }
});
