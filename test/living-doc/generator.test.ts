import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateLivingDoc,
  parseAcceptanceVerdicts,
  parseSpecScenarios,
} from "../../src/living-doc/generator.js";

// ---------------------------------------------------------------------------
// parseSpecScenarios
// ---------------------------------------------------------------------------
describe("parseSpecScenarios", () => {
  it("extracts context from frontmatter", () => {
    const content = `---
context: OrderManagement
---
# Order Spec

## Scenarios

### Create order
`;
    const result = parseSpecScenarios(content, "order.md");
    expect(result.context).toBe("OrderManagement");
  });

  it("extracts scenario titles from ### headings", () => {
    const content = `## Scenarios

### Scenario 1: Create order
Some details

### Scenario 2: Cancel order
More details
`;
    const result = parseSpecScenarios(content, "spec.md");
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios[0].title).toBe("Create order");
    expect(result.scenarios[0].sourceLine).toBeGreaterThan(0);
    expect(result.scenarios[1].title).toBe("Cancel order");
  });

  it("returns empty array when no scenarios section exists", () => {
    const content = `# Some Spec

## Overview

No scenarios here.
`;
    const result = parseSpecScenarios(content, "spec.md");
    expect(result.context).toBeNull();
    expect(result.scenarios).toEqual([]);
  });

  it("extracts tags from [tag] markers in scenario titles", () => {
    const content = `## Scenarios

### Scenario 1: Place order [happy-path] [order]
### Scenario 2: Reject invalid [validation]
`;
    const result = parseSpecScenarios(content, "spec.md");
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios[0].tags).toEqual(["happy-path", "order"]);
    expect(result.scenarios[0].title).toBe("Place order");
    expect(result.scenarios[1].tags).toEqual(["validation"]);
    expect(result.scenarios[1].title).toBe("Reject invalid");
  });
});

// ---------------------------------------------------------------------------
// parseAcceptanceVerdicts
// ---------------------------------------------------------------------------
describe("parseAcceptanceVerdicts", () => {
  it("parses PASS/FAIL/PENDING/SKIP verdicts", () => {
    const content = `# Acceptance Report

- **Scenario**: Create order — ✅ PASS
- **Scenario**: Cancel order — ❌ FAIL
- **Scenario**: Update order — ⏳ PENDING
- **Scenario**: Delete order — ⏭ SKIP
`;
    const result = parseAcceptanceVerdicts(content, "report.md");
    expect(result.size).toBe(4);

    const create = result.get("Create order")!;
    expect(create.verdict).toBe("pass");
    expect(create.timestamp).toBeTruthy();

    const cancel = result.get("Cancel order")!;
    expect(cancel.verdict).toBe("fail");

    const update = result.get("Update order")!;
    expect(update.verdict).toBe("pending");

    const del = result.get("Delete order")!;
    expect(del.verdict).toBe("skip");
  });

  it("returns empty map for empty report", () => {
    const result = parseAcceptanceVerdicts("", "report.md");
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateLivingDoc (filesystem integration)
// ---------------------------------------------------------------------------
describe("generateLivingDoc", () => {
  let tmpDir: string;
  let specsDir: string;
  let acceptanceDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "living-doc-test-"));
    specsDir = path.join(tmpDir, "specs");
    acceptanceDir = path.join(tmpDir, "acceptance");
    fs.mkdirSync(specsDir);
    fs.mkdirSync(acceptanceDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty data with zero stats for empty specs dir", () => {
    const data = generateLivingDoc(specsDir, null);
    expect(data.contexts.size).toBe(0);
    expect(data.globalStats).toEqual({
      totalScenarios: 0,
      pass: 0,
      fail: 0,
      pending: 0,
    });
    expect(data.generatedAt).toBeTruthy();
  });

  it("groups scenarios by context from a single spec", () => {
    fs.writeFileSync(
      path.join(specsDir, "order.md"),
      `---
context: OrderManagement
---
# Order Spec

## Scenarios

### Scenario 1: Create order
### Scenario 2: Cancel order [critical]
`,
    );

    const data = generateLivingDoc(specsDir, null);
    expect(data.contexts.size).toBe(1);
    const ctx = data.contexts.get("OrderManagement")!;
    expect(ctx).toBeDefined();
    expect(ctx.name).toBe("OrderManagement");
    expect(ctx.specs).toHaveLength(1);
    expect(ctx.specs[0].scenarios).toHaveLength(2);
    expect(ctx.specs[0].scenarios[0].lastVerdict).toBe("pending");
    expect(ctx.specs[0].scenarios[1].tags).toEqual(["critical"]);
    expect(data.globalStats.totalScenarios).toBe(2);
    expect(data.globalStats.pending).toBe(2);
  });

  it("merges verdicts from acceptance reports", () => {
    fs.writeFileSync(
      path.join(specsDir, "order.md"),
      `---
context: OrderContext
---
# Order

## Scenarios

### Create order
### Cancel order
`,
    );

    fs.writeFileSync(
      path.join(acceptanceDir, "order-acceptance.md"),
      `# Acceptance

- **Scenario**: Create order — ✅ PASS
- **Scenario**: Cancel order — ❌ FAIL
`,
    );

    const data = generateLivingDoc(specsDir, acceptanceDir);
    const ctx = data.contexts.get("OrderContext")!;
    const scenarios = ctx.specs[0].scenarios;
    expect(scenarios[0].lastVerdict).toBe("pass");
    expect(scenarios[0].lastRunAt).toBeTruthy();
    expect(scenarios[0].acceptanceReportPath).toBeTruthy();
    expect(scenarios[1].lastVerdict).toBe("fail");
    expect(data.globalStats.pass).toBe(1);
    expect(data.globalStats.fail).toBe(1);
    expect(data.globalStats.totalScenarios).toBe(2);
  });

  it("defaults to pending for scenarios without verdicts", () => {
    fs.writeFileSync(
      path.join(specsDir, "order.md"),
      `---
context: OrderContext
---
# Order

## Scenarios

### Create order
### Cancel order
`,
    );

    // Acceptance report only has one scenario
    fs.writeFileSync(
      path.join(acceptanceDir, "report.md"),
      `# Acceptance

- **Scenario**: Create order — ✅ PASS
`,
    );

    const data = generateLivingDoc(specsDir, acceptanceDir);
    const scenarios = data.contexts.get("OrderContext")?.specs[0].scenarios;
    expect(scenarios).toBeDefined();
    expect(scenarios?.[0].lastVerdict).toBe("pass");
    expect(scenarios?.[1].lastVerdict).toBe("pending");
    expect(scenarios?.[1].acceptanceReportPath).toBeNull();
    expect(data.globalStats.pass).toBe(1);
    expect(data.globalStats.pending).toBe(1);
  });

  // T-09.5: three-file layout support
  it("reads scenarios from three-file layout (requirements.md in topic dir)", () => {
    const topicDir = path.join(specsDir, "auth");
    fs.mkdirSync(topicDir);
    fs.writeFileSync(
      path.join(topicDir, "requirements.md"),
      `---
context: AuthContext
workflow_variant: requirements-first
---
# Auth Requirements

## Scenarios

### Login with valid credentials
### Logout clears session
`,
    );
    fs.writeFileSync(path.join(topicDir, "design.md"), "---\n---\n# Auth Design\n");
    fs.writeFileSync(path.join(topicDir, "tasks.md"), "---\n---\n# Auth Tasks\n");

    const data = generateLivingDoc(specsDir, null);
    expect(data.contexts.size).toBe(1);
    const ctx = data.contexts.get("AuthContext")!;
    expect(ctx.specs).toHaveLength(1);
    expect(ctx.specs[0].scenarios).toHaveLength(2);
    expect(ctx.specs[0].scenarios[0].title).toBe("Login with valid credentials");
  });

  it("includes workflow_variant badge in spec entry", () => {
    const topicDir = path.join(specsDir, "payment");
    fs.mkdirSync(topicDir);
    fs.writeFileSync(
      path.join(topicDir, "requirements.md"),
      `---
context: PaymentContext
workflow_variant: design-first
---
# Payment

## Scenarios

### Process payment
`,
    );

    const data = generateLivingDoc(specsDir, null);
    const ctx = data.contexts.get("PaymentContext")!;
    expect(ctx.specs[0].workflowVariant).toBe("design-first");
  });
});
