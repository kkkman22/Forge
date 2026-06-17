import { describe, expect, it } from "vitest";
import type { AcceptanceRunResult, ScenarioArtifact } from "../src/accept.js";
import { aggregateVerdicts, renderAcceptanceReport } from "../src/accept-driver.js";

// Verifies spec R5-AC1..AC6: three-state report rendering.
// T4.2 RED → GREEN

function artifact(
  id: string,
  verdict: ScenarioArtifact["verdict"],
  extra: Partial<ScenarioArtifact> = {},
): ScenarioArtifact {
  return {
    scenarioId: id,
    source: "explicit",
    givenWhenThen: "Given 登录页打开\nWhen 输入 admin 点登录\nThen 跳转 /dashboard 且 显示 欢迎",
    executedAt: "2026-06-17T00:00:00Z",
    verdict,
    evidence: [],
    failureReason: verdict === "FAIL" ? "THEN not satisfied: 跳转 /dashboard" : undefined,
    ...extra,
  };
}

function buildResult(scenarios: ScenarioArtifact[], topic = "login"): AcceptanceRunResult {
  return { topic, scenarios, summary: aggregateVerdicts(scenarios) };
}

describe("renderAcceptanceReport — three-state markers (R5-AC1)", () => {
  it("uses ✅ for PASS, ❌ for FAIL, ⚠️ for INCONCLUSIVE", () => {
    const r = buildResult([
      artifact("s-pass", "PASS"),
      artifact("s-fail", "FAIL"),
      artifact("s-inc", "INCONCLUSIVE"),
    ]);
    const out = renderAcceptanceReport(r);
    expect(out).toContain("✅");
    expect(out).toContain("❌");
    expect(out).toContain("⚠️");
  });

  it("INCONCLUSIVE carries the 'not a failure' suffix (R5-AC1)", () => {
    const r = buildResult([artifact("s-inc", "INCONCLUSIVE")]);
    const out = renderAcceptanceReport(r);
    expect(out).toMatch(/这不是失败|不阻断 ship/i);
  });
});

describe("renderAcceptanceReport — FAIL detail (R5-AC2, R5-AC3, R5-AC4)", () => {
  it("FAIL scenario renders Given/When/Then original + Next hint (R5-AC2/AC4)", () => {
    const r = buildResult([artifact("s-fail", "FAIL")]);
    const out = renderAcceptanceReport(r);
    expect(out).toContain("Given 登录页打开");
    expect(out).toContain("Then 跳转 /dashboard");
    expect(out).toMatch(/Next\s*→/);
  });

  it("PASS scenario collapses to a single line (R5-AC3)", () => {
    const r = buildResult([artifact("s-pass", "PASS")]);
    const out = renderAcceptanceReport(r);
    // PASS should not expand the full G/W/T block (only single line).
    const passSection = out.split("### s-pass")[1] ?? "";
    expect(passSection).not.toContain("Given 登录页打开");
  });

  it("FAIL scenario includes a <details> evidence block (R5-AC3)", () => {
    const r = buildResult([
      artifact("s-fail", "FAIL", { evidence: [".forge/acceptance/login/s-fail/screenshot.png"] }),
    ]);
    const out = renderAcceptanceReport(r);
    expect(out).toContain("<details>");
    expect(out).toContain("screenshot.png");
  });
});

describe("renderAcceptanceReport — summary (R5-AC5, R5-AC6)", () => {
  it("summary table includes an INCONCLUSIVE row (R5-AC6)", () => {
    const r = buildResult([
      artifact("a", "PASS"),
      artifact("b", "INCONCLUSIVE"),
      artifact("c", "INCONCLUSIVE"),
    ]);
    const out = renderAcceptanceReport(r);
    expect(out).toMatch(/INCONCLUSIVE\s*\|\s*2/i);
  });

  it("header shows Blocks Ship and run counts (R5-AC5)", () => {
    const r = buildResult([artifact("a", "PASS"), artifact("b", "FAIL")]);
    const out = renderAcceptanceReport(r);
    expect(out).toContain("Blocks Ship");
    expect(out).toMatch(/YES|NO/);
    expect(out).toMatch(/Run:\s*2\/2/);
  });
});
