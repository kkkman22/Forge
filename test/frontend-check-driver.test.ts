import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { VueA11yRule } from "../src/frontend-check.js";
import { scanVueProject } from "../src/frontend-check.js";

describe("scanVueProject", () => {
  let tmpDir: string;
  const rules: VueA11yRule[] = [
    {
      id: "img-alt",
      pattern: "<img(?![^>]*\\salt=)",
      severity: "P1",
      wcag: "1.1.1",
      description: "Images must have alt text",
      falsePositiveFilter: ["role="],
    },
  ];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vue-scan-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds violations in .vue files", () => {
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src", "App.vue"), '<template><img src="logo.png" /></template>');

    const violations = scanVueProject(tmpDir, rules, ["src/**/*.vue"]);
    expect(violations).toHaveLength(1);
    expect(violations[0].ruleId).toBe("img-alt");
    expect(violations[0].file).toContain("App.vue");
  });

  it("returns empty when no matching files", () => {
    const violations = scanVueProject(tmpDir, rules);
    expect(violations).toHaveLength(0);
  });

  it("skips false positives", () => {
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(
      join(tmpDir, "src", "Logo.vue"),
      '<template><img src="logo.png" role="presentation" /></template>',
    );

    const violations = scanVueProject(tmpDir, rules, ["src/**/*.vue"]);
    expect(violations).toHaveLength(0);
  });
});
