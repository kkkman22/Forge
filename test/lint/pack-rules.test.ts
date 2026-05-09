import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyLintRulesToFile,
  loadPackLintRules,
  type PackLintRule,
} from "../../src/lint/pack-rules.js";

// ---------------------------------------------------------------------------
// Helpers: temp fixture directory for YAML manifests / rule files
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-lint-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(relativePath: string, content: string): string {
  const abs = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
  return abs;
}

// ---------------------------------------------------------------------------
// loadPackLintRules
// ---------------------------------------------------------------------------

describe("loadPackLintRules", () => {
  it("loads manifest + individual rule YAMLs", () => {
    const manifestContent = `
rules:
  - id: money/no-number-for-money
    severity: warn
    entry: rules/money-no-number.yaml
    target_globs:
      - "src/**/*.ts"
    description: "禁止 number 类型承载金额"
`;
    writeFixture("lint-rules/manifest.yaml", manifestContent);

    const ruleContent = `
id: money/no-number-for-money
severity: warn
description: "禁止 number 类型承载金额"
target_globs:
  - "src/**/*.ts"
patterns:
  - type: regex
    expression: "(?:const|let|var)\\\\s+(?:amount|price)\\\\s*:\\\\s*number\\\\b"
    message: "金额类变量应使用 Money 值对象"
    fix_suggestion: "改用 Money: const amount: Money = Money.of(100, 'CNY')"
`;
    writeFixture("lint-rules/rules/money-no-number.yaml", ruleContent);

    const rules = loadPackLintRules(tmpDir, "lint-rules/manifest.yaml");

    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("money/no-number-for-money");
    expect(rules[0].severity).toBe("warn");
    expect(rules[0].description).toBe("禁止 number 类型承载金额");
    expect(rules[0].target_globs).toEqual(["src/**/*.ts"]);
    expect(rules[0].patterns).toHaveLength(1);
    expect(rules[0].patterns[0].type).toBe("regex");
    expect(rules[0].patterns[0].message).toBe("金额类变量应使用 Money 值对象");
    expect(rules[0].patterns[0].fix_suggestion).toBe(
      "改用 Money: const amount: Money = Money.of(100, 'CNY')",
    );
    expect(rules[0].sourcePack).toBe(path.basename(tmpDir));
    expect(rules[0].entryPath).toContain("rules/money-no-number.yaml");
  });

  it("returns empty array when manifest doesn't exist", () => {
    const rules = loadPackLintRules(tmpDir, "lint-rules/manifest.yaml");
    expect(rules).toEqual([]);
  });

  it("loads multiple rules from manifest", () => {
    const manifestContent = `
rules:
  - id: rule-a
    severity: error
    entry: rules/a.yaml
    target_globs:
      - "src/**/*.ts"
    description: "Rule A"
  - id: rule-b
    severity: warn
    entry: rules/b.yaml
    target_globs:
      - "test/**/*.ts"
    description: "Rule B"
`;
    writeFixture("lint-rules/manifest.yaml", manifestContent);
    writeFixture(
      "lint-rules/rules/a.yaml",
      `
id: rule-a
severity: error
description: "Rule A"
target_globs:
  - "src/**/*.ts"
patterns:
  - type: regex
    expression: "bad-pattern"
    message: "found bad"
    fix_suggestion: "fix it"
`,
    );
    writeFixture(
      "lint-rules/rules/b.yaml",
      `
id: rule-b
severity: warn
description: "Rule B"
target_globs:
  - "test/**/*.ts"
patterns:
  - type: regex
    expression: "worse-pattern"
    message: "found worse"
    fix_suggestion: "fix it worse"
`,
    );

    const rules = loadPackLintRules(tmpDir, "lint-rules/manifest.yaml");
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id).sort()).toEqual(["rule-a", "rule-b"]);
  });
});

// ---------------------------------------------------------------------------
// applyLintRulesToFile
// ---------------------------------------------------------------------------

describe("applyLintRulesToFile", () => {
  const baseRule: PackLintRule = {
    id: "money/no-number-for-money",
    severity: "warn",
    description: "禁止 number 类型承载金额",
    target_globs: ["src/**/*.ts"],
    patterns: [
      {
        type: "regex",
        expression:
          "(?:const|let|var)\\s+(?:amount|price|cost|fee|charge|total|balance|subtotal|tax)\\s*:\\s*number\\b",
        message: "金额类变量应使用 Money 值对象",
        fix_suggestion: "改用 Money: const amount: Money = Money.of(100, 'CNY')",
      },
    ],
    sourcePack: "test-pack",
    entryPath: "lint-rules/rules/money-no-number.yaml",
  };

  it("matches file by target_glob", () => {
    const content = "const amount: number = 100;\n";
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [baseRule]);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("applies regex pattern and returns findings", () => {
    const content = "const amount: number = 100;\n";
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [baseRule]);

    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("money/no-number-for-money");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].file).toBe("src/domain/money.ts");
    expect(findings[0].message).toBe("金额类变量应使用 Money 值对象");
  });

  it("returns empty when no rules match file path", () => {
    const content = "const amount: number = 100;\n";
    const findings = applyLintRulesToFile("test/unit/money.test.ts", content, [baseRule]);
    expect(findings).toEqual([]);
  });

  it("skips lines with escape hatch comment", () => {
    const content = "const amount: number = 100; // @forge:allow-raw-date\n";
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [baseRule]);
    expect(findings).toEqual([]);
  });

  it("skips lines with any @forge:allow- escape hatch", () => {
    const content = "const amount: number = 100; // @forge:allow-cross-context\n";
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [baseRule]);
    expect(findings).toEqual([]);
  });

  it("reports correct line number", () => {
    const content = [
      "// line 1 comment",
      "// line 2 comment",
      "const amount: number = 100;",
      "// line 4",
    ].join("\n");
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [baseRule]);

    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(3);
  });

  it("handles multiple patterns per rule", () => {
    const multiPatternRule: PackLintRule = {
      ...baseRule,
      patterns: [
        {
          type: "regex",
          expression: "(?:const|let|var)\\s+price\\s*:\\s*number\\b",
          message: "price should use Money",
          fix_suggestion: "use Money",
        },
        {
          type: "regex",
          expression: "(?:const|let|var)\\s+amount\\s*:\\s*number\\b",
          message: "amount should use Money",
          fix_suggestion: "use Money",
        },
      ],
    };

    const content = "const amount: number = 50;\nconst price: number = 30;\n";
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [multiPatternRule]);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.message)).toContain("amount should use Money");
    expect(findings.map((f) => f.message)).toContain("price should use Money");
  });

  it("collects findings from multiple matching rules", () => {
    const rule2: PackLintRule = {
      id: "money/no-money-constructor",
      severity: "error",
      description: "Don't use new Money()",
      target_globs: ["src/**/*.ts"],
      patterns: [
        {
          type: "regex",
          expression: "new\\s+Money\\(",
          message: "Use Money.of() instead of new Money()",
          fix_suggestion: "use Money.of()",
        },
      ],
      sourcePack: "test-pack",
      entryPath: "lint-rules/rules/no-constructor.yaml",
    };

    const content = "const amount: number = 100;\nconst m = new Money(50, 'CNY');\n";
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [baseRule, rule2]);

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.ruleId)).toContain("money/no-number-for-money");
    expect(findings.map((f) => f.ruleId)).toContain("money/no-money-constructor");
  });

  it("maps warn severity to warning", () => {
    const content = "const amount: number = 100;\n";
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [baseRule]);
    expect(findings[0].severity).toBe("warning");
  });

  it("maps error severity correctly", () => {
    const errorRule: PackLintRule = {
      ...baseRule,
      severity: "error",
    };
    const content = "const amount: number = 100;\n";
    const findings = applyLintRulesToFile("src/domain/money.ts", content, [errorRule]);
    expect(findings[0].severity).toBe("error");
  });
});
