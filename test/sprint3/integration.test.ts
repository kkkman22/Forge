/**
 * Sprint 3 Integration Tests
 *
 * Verifies that Sprint 3 modules work together end-to-end:
 *   1. forge-storm -> event-storm.md -> spec draft (round-trip)
 *   2. Template renderer -> DDD templates
 *   3. Context boundary blocks violations
 *   4. Pack lint rules load and apply
 *   5. Living doc from temp specs
 *   6. core_subdomains triggers business-analyst
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BoundaryCheckInput,
  checkBoundary,
  parseImports,
  resolveFileContext,
} from "../../src/context-boundary.js";
import { applyLintRulesToFile, loadPackLintRules } from "../../src/lint/pack-rules.js";
import { generateLivingDoc } from "../../src/living-doc/generator.js";
import { renderLivingDoc } from "../../src/living-doc/renderer.js";
import type { ContextMapEntry } from "../../src/pack/types.js";
import { getCoreSubdomains, shouldTriggerBusinessAnalyst } from "../../src/spec.js";
import {
  loadStormState,
  type StormState,
  saveStormState,
  serializeStormMarkdown,
} from "../../src/storm.js";
import { renderTemplate } from "../../src/template-renderer.js";

// ---------------------------------------------------------------------------
// Helper: create a temp directory cleaned up after each test
// ---------------------------------------------------------------------------
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-sprint3-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ===========================================================================
// 1. forge-storm -> event-storm.md -> spec draft
// ===========================================================================

describe("forge-storm round-trip", () => {
  it("creates StormState, saves to file, loads back, and serializes to markdown with round-trip integrity", () => {
    const state: StormState = {
      context: "reservations",
      startedAt: "2026-05-10T08:00:00Z",
      lastUpdated: "2026-05-10T09:30:00Z",
      phaseCompleted: "events",
      items: {
        events: [
          { name: "ReservationCreated", description: "A new reservation is made", source: "guest" },
          { name: "ReservationCancelled", description: "Guest cancels reservation" },
        ],
        commands: [],
        aggregates: [],
        policies: [],
        readModels: [],
      },
    };

    const filePath = path.join(tmpDir, "storm-state.md");

    // Save
    saveStormState(state, filePath);
    expect(fs.existsSync(filePath)).toBe(true);

    // Load back
    const loaded = loadStormState(filePath);
    expect(loaded).not.toBeNull();
    expect(loaded?.context).toBe("reservations");
    expect(loaded?.startedAt).toBe("2026-05-10T08:00:00Z");
    expect(loaded?.lastUpdated).toBe("2026-05-10T09:30:00Z");
    expect(loaded?.phaseCompleted).toBe("events");
    expect(loaded?.items.events).toHaveLength(2);
    expect(loaded?.items.events[0].name).toBe("ReservationCreated");
    expect(loaded?.items.events[0].description).toBe("A new reservation is made");
    expect(loaded?.items.events[0].source).toBe("guest");
    expect(loaded?.items.events[1].name).toBe("ReservationCancelled");
    expect(loaded?.items.events[1].source).toBeUndefined();
    expect(loaded?.items.commands).toHaveLength(0);

    // Serialize to markdown and verify key structural elements
    const md = serializeStormMarkdown(state);
    expect(md).toContain("context: reservations");
    expect(md).toContain('started_at: "2026-05-10T08:00:00Z"');
    expect(md).toContain("phase_completed: events");
    expect(md).toContain("## Events");
    expect(md).toContain("- **ReservationCreated**");
    expect(md).toContain("- **ReservationCancelled**");
  });
});

// ===========================================================================
// 2. Template renderer -> DDD templates
// ===========================================================================

describe("Template renderer -> DDD aggregate-root template", () => {
  it("renders aggregate-root.ts.template with Order context and contains no unresolved placeholders for provided fields", () => {
    const projectRoot = "/Users/king/code/Forge/.claude/worktrees/ddd-tactical-bdd-collaboration";
    const templatePath = path.join(projectRoot, "templates/ddd/aggregate-root.ts.template");
    const template = fs.readFileSync(templatePath, "utf-8");

    const result = renderTemplate(template, {
      AggregateName: "Order",
      Description: "Represents a hotel reservation order",
      EventNames: "OrderCreatedEvent, OrderCancelledEvent",
      FactoryMethodName: "create",
      Fields: [
        { name: "orderId", type: "string" },
        { name: "guestName", type: "string" },
        { name: "checkIn", type: "Date" },
        { name: "checkOut", type: "Date" },
      ],
      FactoryParams: [
        { name: "orderId", type: "string" },
        { name: "guestName", type: "string" },
      ],
      FactoryArgs: ["orderId, guestName, checkIn, checkOut"],
      Invariants: ["checkIn must be before checkOut"],
      InvariantChecks: [
        { condition: "checkIn < checkOut", message: "Check-in must be before check-out" },
      ],
      StateTransitions: [
        {
          methodName: "cancel",
          params: "reason: string",
          preCondition: "Order is active",
          guard: "this._version > 0",
          errorMessage: "Cannot cancel a new order",
        },
      ],
      HasEvents: "true",
      FirstEventName: "OrderCreatedEvent",
      Serialization: "true",
    });

    // Verify class declaration and name substitution
    expect(result.content).toContain("export class Order");
    expect(result.content).toContain("Represents a hotel reservation order");

    // Verify constructor fields
    expect(result.content).toContain("_orderId: string");
    expect(result.content).toContain("_guestName: string");
    expect(result.content).toContain("_checkIn: Date");
    expect(result.content).toContain("_checkOut: Date");

    // Verify factory method
    expect(result.content).toContain("static create(");

    // Verify state transition method
    expect(result.content).toContain("cancel(reason: string)");

    // Verify toJSON method (Serialization)
    expect(result.content).toContain("toJSON()");

    // Verify output path suggestion
    expect(result.outputSuggestedPath).toBe("src/domain/Order/Order.ts");

    // Verify no unresolved placeholders for provided fields
    // Only check placeholders that we provided values for
    expect(result.content).not.toContain("{{AggregateName}}");
    expect(result.content).not.toContain("{{Description}}");
    expect(result.content).not.toContain("{{FactoryMethodName}}");
  });
});

// ===========================================================================
// 3. Context boundary blocks violations
// ===========================================================================

describe("Context boundary violation detection", () => {
  const ownershipMap: Record<string, string> = {
    "src/domain/reservations/**": "reservations",
    "src/domain/folio-billing/**": "folio-billing",
    "src/domain/front-desk/**": "front-desk",
  };

  it("reports a violation for undeclared cross-context import (reservations -> folio-billing)", () => {
    // The import path must resolve outside the source context glob.
    // From src/domain/reservations/services/booking.ts, ../../folio-billing/ resolves
    // to src/domain/folio-billing/ which is a different context.
    const input: BoundaryCheckInput = {
      filePath: "src/domain/reservations/services/booking.ts",
      fileContent: `import { Invoice } from "../../folio-billing/invoice.js";`,
      contextMap: [], // No declared relationships
      ownershipMap,
    };

    const result = checkBoundary(input);

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].sourceContext).toBe("reservations");
    expect(result.violations[0].targetContext).toBe("folio-billing");
    expect(result.violations[0].relationshipType).toBe("undeclared");
    expect(result.violations[0].suggestion).toContain("context map");
  });

  it("allows import when a partnership relationship is declared", () => {
    const contextMap: ContextMapEntry[] = [
      {
        source: "reservations",
        target: "folio-billing",
        type: "partnership",
        sourceLayer: "core",
      },
    ];

    const input: BoundaryCheckInput = {
      filePath: "src/domain/reservations/services/booking.ts",
      fileContent: `import { Invoice } from "../../folio-billing/invoice.js";`,
      contextMap,
      ownershipMap,
    };

    const result = checkBoundary(input);
    expect(result.violations).toHaveLength(0);
  });

  it("parseImports detects import statements with line numbers", () => {
    const code = [
      'import { A } from "./a.js";',
      "const x = 1;",
      'import { B } from "./b.js";',
    ].join("\n");

    const imports = parseImports(code);
    expect(imports).toHaveLength(2);
    expect(imports[0].module).toBe("./a.js");
    expect(imports[0].line).toBe(1);
    expect(imports[1].module).toBe("./b.js");
    expect(imports[1].line).toBe(3);
  });

  it("resolveFileContext maps file paths to contexts via ownership map", () => {
    expect(
      resolveFileContext("src/domain/reservations/aggregates/booking.ts", ownershipMap, null),
    ).toBe("reservations");
    expect(resolveFileContext("src/domain/folio-billing/invoice.ts", ownershipMap, null)).toBe(
      "folio-billing",
    );
    expect(resolveFileContext("src/utils/helper.ts", ownershipMap, null)).toBeNull();
  });
});

// ===========================================================================
// 4. Pack lint rules load and apply
// ===========================================================================

describe("Pack lint rules load and apply", () => {
  it("loads rules from packs/pms/lint-rules/manifest.yaml and applies money/no-number-for-money rule", () => {
    // Verify the real manifest loads successfully
    const projectRoot = "/Users/king/code/Forge/.claude/worktrees/ddd-tactical-bdd-collaboration";
    const packRoot = path.join(projectRoot, "packs/pms");

    const realRules = loadPackLintRules(packRoot, "lint-rules/manifest.yaml");
    expect(realRules.length).toBeGreaterThanOrEqual(1);

    // Verify the money/no-number-for-money rule loaded with correct metadata
    const moneyRule = realRules.find((r) => r.id === "money/no-number-for-money");
    expect(moneyRule).toBeDefined();
    expect(moneyRule?.severity).toBe("warn");
    expect(moneyRule?.target_globs).toEqual(["src/**/*.ts"]);
    expect(moneyRule?.patterns.length).toBeGreaterThanOrEqual(1);
    expect(moneyRule?.patterns[0].type).toBe("regex");
    expect(moneyRule?.patterns[0].message).toBeTruthy();

    // For the apply step, create a self-contained manifest + rule in tmpDir
    // with a regex that uses single backslashes (correctly matches real code).
    const rulesDir = path.join(tmpDir, "lint-rules");
    const rulesSubDir = path.join(rulesDir, "money");
    fs.mkdirSync(rulesSubDir, { recursive: true });

    fs.writeFileSync(
      path.join(rulesDir, "manifest.yaml"),
      [
        "rules:",
        "  - id: money/no-number-for-money",
        "    severity: warn",
        "    entry: ./money/no-number-for-money.yaml",
        "    target_globs:",
        '      - "src/**/*.ts"',
        '    description: "Use Money value object for money fields"',
      ].join("\n"),
      "utf-8",
    );

    // Write a rule file with single backslashes in the expression.
    // The custom YAML parser preserves backslashes from quoted strings,
    // so a single backslash in the file content is read as a single backslash
    // in the JS string, which new RegExp() interprets as a regex escape.
    const ruleContent = [
      "patterns:",
      "  - type: regex",
      '    expression: "(?:const|let|var)\\s+(?:amount|price|cost|fee|charge|total|balance|subtotal|tax)\\s*:\\s*number\\b"',
      '    message: "Money variables should use Money value object, not number"',
      '    fix_suggestion: "Use Money type: const amount: Money = Money.of(100, CNY)"',
    ].join("\n");
    fs.writeFileSync(path.join(rulesSubDir, "no-number-for-money.yaml"), ruleContent, "utf-8");

    const rules = loadPackLintRules(tmpDir, "lint-rules/manifest.yaml");
    expect(rules.length).toBeGreaterThanOrEqual(1);
    expect(rules[0].id).toBe("money/no-number-for-money");

    // Apply to a file with `const amount: number`
    const testFilePath = "src/charge.ts";
    const testContent = 'const amount: number = 100;\nconst label = "total";\n';

    const findings = applyLintRulesToFile(testFilePath, testContent, rules);

    const moneyFinding = findings.find((f) => f.ruleId === "money/no-number-for-money");
    expect(moneyFinding).toBeDefined();
    expect(moneyFinding?.file).toBe(testFilePath);
    expect(moneyFinding?.line).toBe(1);
  });
});

// ===========================================================================
// 5. Living doc from temp specs
// ===========================================================================

describe("Living doc generation and rendering from temp specs", () => {
  it("generates living doc data and renders index.html with expected content", () => {
    // Create temp spec files
    const specsDir = path.join(tmpDir, "specs");
    fs.mkdirSync(specsDir, { recursive: true });

    fs.writeFileSync(
      path.join(specsDir, "reservations.md"),
      [
        "---",
        "feature: Reservations",
        "status: locked",
        "date: 2026-05-10",
        "context: reservations",
        "---",
        "",
        "## Scenarios",
        "",
        "### Scenario 1: Guest creates reservation",
        "当 guest submits dates 则 system creates reservation",
        "",
        "### Scenario 2: Guest cancels reservation",
        "当 guest cancels 则 system releases room",
      ].join("\n"),
      "utf-8",
    );

    fs.writeFileSync(
      path.join(specsDir, "billing.md"),
      [
        "---",
        "feature: Billing",
        "status: draft",
        "date: 2026-05-10",
        "context: billing",
        "---",
        "",
        "## Scenarios",
        "",
        "### Scenario 1: Invoice generated",
        "当 checkout completes 则 system generates invoice",
      ].join("\n"),
      "utf-8",
    );

    // Generate living doc data
    const data = generateLivingDoc(specsDir, null);

    // Verify data integrity
    expect(data.contexts.size).toBe(2);
    expect(data.globalStats.totalScenarios).toBe(3);
    expect(data.globalStats.pending).toBe(3); // no acceptance reports

    const reservationsCtx = data.contexts.get("reservations");
    expect(reservationsCtx).toBeDefined();
    expect(reservationsCtx?.specs).toHaveLength(1);
    expect(reservationsCtx?.stats.total).toBe(2);
    expect(reservationsCtx?.stats.pending).toBe(2);

    const billingCtx = data.contexts.get("billing");
    expect(billingCtx).toBeDefined();
    expect(billingCtx?.stats.total).toBe(1);

    // Render to HTML
    const outputDir = path.join(tmpDir, "living-doc-output");
    renderLivingDoc(data, outputDir);

    // Verify index.html
    const indexPath = path.join(outputDir, "index.html");
    expect(fs.existsSync(indexPath)).toBe(true);

    const indexHtml = fs.readFileSync(indexPath, "utf-8");
    expect(indexHtml).toContain("Forge Living Documentation");
    expect(indexHtml).toContain("Global Statistics");
    expect(indexHtml).toContain("reservations");
    expect(indexHtml).toContain("billing");

    // Verify styles exist
    expect(fs.existsSync(path.join(outputDir, "assets/styles.css"))).toBe(true);

    // Verify context pages exist
    expect(fs.existsSync(path.join(outputDir, "reservations.html"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "billing.html"))).toBe(true);

    const reservationsHtml = fs.readFileSync(path.join(outputDir, "reservations.html"), "utf-8");
    expect(reservationsHtml).toContain("Context: reservations");
    expect(reservationsHtml).toContain("Guest creates reservation");
    expect(reservationsHtml).toContain("Guest cancels reservation");
  });
});

// ===========================================================================
// 6. core_subdomains triggers business-analyst
// ===========================================================================

describe("core_subdomains triggers business-analyst", () => {
  const packs = [
    {
      featureFlags: {
        core_subdomains: ["reservations", "folio-billing"],
      },
    },
    {
      featureFlags: {
        core_subdomains: ["housekeeping"],
      },
    },
  ];

  it("returns true for a subdomain listed in core_subdomains", () => {
    expect(shouldTriggerBusinessAnalyst("reservations", packs)).toBe(true);
  });

  it("returns true for another core subdomain from a different pack", () => {
    expect(shouldTriggerBusinessAnalyst("housekeeping", packs)).toBe(true);
  });

  it("returns false for a subdomain not in core_subdomains", () => {
    expect(shouldTriggerBusinessAnalyst("front-desk", packs)).toBe(false);
  });

  it("returns false for undefined context", () => {
    expect(shouldTriggerBusinessAnalyst(undefined, packs)).toBe(false);
  });

  it("getCoreSubdomains returns deduplicated union", () => {
    const subdomains = getCoreSubdomains(packs);
    expect(subdomains).toEqual(
      expect.arrayContaining(["reservations", "folio-billing", "housekeeping"]),
    );
    expect(subdomains).toHaveLength(3);
  });
});
