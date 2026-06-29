/**
 * T1 — src/domain/ independent tsconfig project ref (REQ-01, INV-1).
 *
 * Verifies the in-repo dogfood reference domain has its own tsconfig so it
 * does NOT pollute the Forge main build:
 *   - src/domain/tsconfig.json exists with composite:true (project ref)
 *   - root tsconfig.json excludes src/domain/** (main build skips it)
 *   - the domain project compiles standalone
 *
 * category: contract
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const DOMAIN_TSCONFIG = resolve(ROOT, "src/domain/tsconfig.json");
const ROOT_TSCONFIG = resolve(ROOT, "tsconfig.json");

describe("T1: src/domain/ independent tsconfig project ref (REQ-01)", () => {
  it("src/domain/tsconfig.json exists", () => {
    expect(existsSync(DOMAIN_TSCONFIG)).toBe(true);
  });

  it("domain tsconfig has composite:true (project ref)", () => {
    const raw = readFileSync(DOMAIN_TSCONFIG, "utf-8");
    // strip comments / trailing commas for JSON.parse tolerance
    const json = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""));
    expect(json.compilerOptions?.composite).toBe(true);
  });

  it("root tsconfig.json excludes src/domain/** (INV-1: main build isolation)", () => {
    const raw = readFileSync(ROOT_TSCONFIG, "utf-8");
    const json = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""));
    const exclude = json.exclude ?? [];
    expect(exclude.some((e: string) => e.includes("src/domain"))).toBe(true);
  });

  it("domain project compiles standalone (tsc --noEmit -p src/domain/tsconfig.json)", () => {
    // Only run if tsc is available; this is the independent-compile proof (REQ-01).
    let result: { status: number; stderr: string };
    try {
      const out = execSync("npx tsc --noEmit -p src/domain/tsconfig.json", {
        cwd: ROOT,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      result = { status: 0, stderr: out };
    } catch (e) {
      result = { status: (e as { status: number }).status ?? 1, stderr: (e as Error).message };
    }
    expect(result.status, `domain tsc failed: ${result.stderr}`).toBe(0);
  });
});
