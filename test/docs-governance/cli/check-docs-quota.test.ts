import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "../../../scripts/check-docs-quota.ts");
const ROOT = resolve(__dirname, "../../..");

function run(args: string[], env?: Record<string, string>) {
  try {
    const output = execFileSync("npx", ["tsx", SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf-8",
      env: { ...process.env, ...env },
      timeout: 15_000,
    });
    return { exitCode: 0, stdout: output, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

import { computeExitResult } from "../../../src/docs-governance/cli/_runtime.js";
import { checkQuota, countDocPairs } from "../../../src/docs-governance/quota.js";
import {
  formatDiagnostics,
  formatNdjson,
} from "../../../src/docs-governance/reporter/diagnostic.js";
import type { Config, DiagnosticRecord } from "../../../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-quota";

function makeDiag(overrides: Partial<DiagnosticRecord> = {}): DiagnosticRecord {
  return {
    script: SCRIPT_NAME,
    severity: "error",
    file: ".tinkerman/config.md" as any,
    message: "test diagnostic",
    ...overrides,
  };
}

const baseConfig = (maxCount: number): Config => ({
  docs: {
    max_count: maxCount,
    root_whitelist: [],
    ssot_sources: [],
  },
  staleness: {
    warning_days: 90,
    critical_days: 180,
    exempt_paths: [],
    warning_log_cap: 50,
  },
  diagnosticsFromConfigLoad: [],
});

describe("check-docs-quota CLI logic", () => {
  describe("--help flag", () => {
    it("exits 0 with --help", () => {
      const result = run(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("check-docs-quota");
      expect(result.stdout).toContain("--json");
      expect(result.stdout).toContain("--allow-grow");
    });

    it("exits 0 with -h", () => {
      const result = run(["-h"]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("argument parsing", () => {
    it("--json flag produces parseable NDJSON", () => {
      const result = run(["--json"]);
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it("--allow-grow flag is documented in help", () => {
      const result = run(["--help"]);
      expect(result.stdout).toContain("--allow-grow");
    });
  });

  describe("computeExitResult integration", () => {
    it("returns exit code 0 when under quota", () => {
      const result = computeExitResult(() => []);
      expect(result.exitCode).toBe(0);
    });

    it("returns exit code 1 when quota exceeded", () => {
      const result = computeExitResult(() => [
        makeDiag({
          severity: "error",
          message: "Doc count 30 >= max_count 30",
          code: "QUOTA_EXCEEDED",
        }),
      ]);
      expect(result.exitCode).toBe(1);
    });

    it("returns exit code 0 for warnings only", () => {
      const result = computeExitResult(() => [
        makeDiag({
          severity: "warning",
          message: "Approaching limit",
        }),
      ]);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("formatDiagnostics for quota output", () => {
    it("formats QUOTA_EXCEEDED error", () => {
      const diags = [
        makeDiag({
          severity: "error",
          message: "Doc count 30 >= max_count 30. Use --allow-grow with an ADR to raise the limit.",
          code: "QUOTA_EXCEEDED",
        }),
      ];
      const output = formatDiagnostics(diags);
      expect(output).toContain("error");
      expect(output).toContain("--allow-grow");
      expect(output).toContain("Summary:");
    });

    it("formats NDJSON with code field", () => {
      const diags = [makeDiag({ code: "QUOTA_EXCEEDED" })];
      const output = formatNdjson(diags);
      const parsed = JSON.parse(output);
      expect(parsed.script).toBe(SCRIPT_NAME);
      expect(parsed.code).toBe("QUOTA_EXCEEDED");
    });
  });

  describe("quota logic used by CLI", () => {
    it("checkQuota returns empty when under limit", () => {
      const files = ["docs/a.md"];
      const diags = checkQuota(files, baseConfig(30));
      expect(diags).toHaveLength(0);
    });

    it("checkQuota errors when at limit", () => {
      const files = ["docs/a.md", "docs/b.md"];
      const diags = checkQuota(files, baseConfig(2));
      expect(diags.some((d) => d.severity === "error")).toBe(true);
    });

    it("checkQuota accepts --allow-grow with valid ADR", () => {
      const files = ["docs/a.md", "docs/b.md"];
      const diags = checkQuota(files, baseConfig(1), {
        allowGrow: ".tinkerman/decisions/ADR-001-quota-raise.md",
      });
      expect(diags.every((d) => d.code !== "QUOTA_ALLOW_GROW_NO_ADR")).toBe(true);
    });

    it("checkQuota rejects --allow-grow without valid ADR path", () => {
      const files = ["docs/a.md", "docs/b.md"];
      const diags = checkQuota(files, baseConfig(1), { allowGrow: "not-a-valid-adr" });
      expect(diags.some((d) => d.code === "QUOTA_ALLOW_GROW_NO_ADR")).toBe(true);
    });

    it("countDocPairs pairs cn+en correctly", () => {
      const files = ["docs/guide.md", "docs/guide.en.md", "docs/api.md"];
      const result = countDocPairs(files);
      expect(result.count).toBe(2);
    });
  });
});
