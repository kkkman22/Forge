/**
 * Contract tests for Bugfix Mode pre-flight checks.
 *
 * Verifies the 3-item pre-flight check gate in bugfix-mode.md:
 * 1. Not from review output → use /tinkerman debug
 * 2. Requires architecture change → use /tinkerman debug (trigger ADR)
 * 3. Description insufficient → prompt for info, return to router
 *
 * Also validates analyze/apply/verify phases and log escalation.
 *
 * **Validates: Spec Requirements 2, 7, 8**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const BUGFIX_MODE = resolve(ROOT, "skills/tinkerman/lib/build/references/bugfix-mode.md");

describe("Bugfix Mode pre-flight checks", () => {
  let content: string;

  it("bugfix-mode.md file exists", () => {
    content = readFileSync(BUGFIX_MODE, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("contains all 3 pre-flight check items", () => {
    content ??= readFileSync(BUGFIX_MODE, "utf-8");
    for (let i = 1; i <= 3; i++) {
      expect(content).toMatch(new RegExp(`\\|\\s*${i}\\s*\\|`));
    }
  });

  it("check 1: non-review issues route to debug", () => {
    content ??= readFileSync(BUGFIX_MODE, "utf-8");
    expect(content).toMatch(/review|debug/i);
  });

  it("check 2: architecture change routes to debug with ADR", () => {
    content ??= readFileSync(BUGFIX_MODE, "utf-8");
    expect(content).toMatch(/architecture/i);
    expect(content).toMatch(/debug|ADR/i);
  });

  it("check 3: insufficient description prompts for info", () => {
    content ??= readFileSync(BUGFIX_MODE, "utf-8");
    expect(content).toMatch(/insufficient|描述/);
    expect(content).toMatch(/prompt|补充/i);
  });

  it("rejection format is structured", () => {
    content ??= readFileSync(BUGFIX_MODE, "utf-8");
    expect(content).toMatch(/命中检查|Route on Hit/);
  });
});

describe("Bugfix Mode phase structure", () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(BUGFIX_MODE, "utf-8");
  });

  it("contains analyze phase with 5-step analysis", () => {
    expect(content).toMatch(/analyze/i);
    expect(content).toMatch(/Locate|定位/i);
    expect(content).toMatch(/Reproduce|复现/i);
    expect(content).toMatch(/Confirm|确认/i);
    expect(content).toMatch(/Assess|评估/i);
    expect(content).toMatch(/Propose|方案/i);
  });

  it("contains apply phase with scoped file changes", () => {
    expect(content).toMatch(/apply/i);
    expect(content).toMatch(/只改|only.*file/i);
  });

  it("contains verify phase with 4-step checklist", () => {
    expect(content).toMatch(/verify/i);
    expect(content).toMatch(/复现验证|reproduce/i);
    expect(content).toMatch(/期望验证|expect/i);
    expect(content).toMatch(/回归|regression/i);
  });

  it("documents log escalation max 2 rounds", () => {
    expect(content).toMatch(/日志调试|log.*escalat/i);
    expect(content).toMatch(/2.*轮|2.*round/i);
    expect(content).toMatch(/exhausted|回 analyze/i);
  });

  it("light tier fast-track skips analyze", () => {
    expect(content).toMatch(/light|快速通道/i);
    expect(content).toMatch(/跳过 analyze/i);
  });
});
