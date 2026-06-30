/**
 * Unit tests for check-unused-module.mjs — four-dimensional dead-code detector.
 *
 * gap-remediate-0630 spec Wave 2 / T-03 + T-04.
 *
 * The check is exercised end-to-end via spawnSync against the real repo so the
 * skip wiring and scan logic are validated, not just an isolated function.
 *
 * Assertions (RED → GREEN):
 *   (a) `--help` → exit 0 with usage text
 *   (b) tmpdir with a module that has zero references → exit 0 (true dead code)
 *   (c) `src/state-machine/` → exit non-zero AND output references a test path
 *       (`test/pms-pack` OR `test/pack/zero-pack-invariant`) AND `packs/pms/state-machines`
 *   (d) no args → exit 0 (avoids false-positives when wired into `npm run check`)
 *   (e) FORGE_SKIP_UNUSED_CHECK=1 → exit 0
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");
const CHECK_SCRIPT = resolve(REPO_ROOT, "scripts/check-unused-module.mjs");

/**
 * Run the check script against the real repo root.
 * Returns { status, stdout, stderr }.
 */
function runCheck(
  args: string[] = [],
  envOverride: NodeJS.ProcessEnv = {},
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const env = { ...process.env };
  // Delete the skip var by default so tests are deterministic; envOverride can
  // re-set it (e.g. the FORGE_SKIP test).
  delete env.FORGE_SKIP_UNUSED_CHECK;
  Object.assign(env, envOverride);
  const r = spawnSync(process.execPath, [CHECK_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf-8",
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

describe("check-unused-module.mjs — four-dimensional dead-code detector", () => {
  const tmpDirs: string[] = [];

  it("(a) --help → exit 0 and prints usage", () => {
    const res = runCheck(["--help"]);
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(0);
    expect(res.stdout.toLowerCase()).toMatch(/usage/);
  });

  it("(b) a module with zero references (tmpdir fixture) → exit 0", () => {
    // Build a throwaway module dir under a tmp repo-like tree that contains NO
    // reference to the module anywhere. Because the scanner searches src/ test/
    // scripts/ and packs/ of the real repo for the module's name, a freshly
    // invented name (random) will have zero hits → exit 0 (true dead code).
    const token = `phantom${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const tmp = mkdtempSync(join(tmpdir(), `forge-unused-${token}-`));
    tmpDirs.push(tmp);
    // A module dir whose path is globally unique — nothing in the repo imports it.
    const modDir = resolve(tmp, "src/lonely-module");
    mkdirSync(modDir, { recursive: true });
    writeFileSync(join(modDir, "index.ts"), `export const ${token} = 1;\n`);

    // Pass the absolute module path; the scanner greps the repo for it.
    const res = runCheck([modDir]);
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(0);
  });

  it("(c) src/state-machine/ → exit non-zero and reports test + packs dimensions", () => {
    const res = runCheck(["src/state-machine/"]);
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).not.toBe(0);

    const out = (res.stdout + res.stderr).toLowerCase();
    // Dimension c (test usage): at least one of these test paths is cited.
    expect(
      out.includes("test/pms-pack") || out.includes("test/pack/zero-pack-invariant"),
      `expected a test reference in output:\n${res.stdout}\n${res.stderr}`,
    ).toBe(true);
    // Dimension d (data dir usage): the packs state-machines dir is cited.
    expect(
      out.includes("packs/pms/state-machines"),
      `expected packs/pms/state-machines in output:\n${res.stdout}\n${res.stderr}`,
    ).toBe(true);
  });

  it("(d) no args → exit 0 (safe when wired into npm run check)", () => {
    const res = runCheck([]);
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(0);
  });

  it("(e) FORGE_SKIP_UNUSED_CHECK=1 → exit 0 even for a referenced module", () => {
    const res = runCheck(["src/state-machine/"], { FORGE_SKIP_UNUSED_CHECK: "1" });
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(0);
    expect((res.stdout + res.stderr).toLowerCase()).toMatch(/skip/);
  });

  // Cleanup all temp dirs after the suite
  it("cleanup temp dirs", () => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
