/**
 * Unit tests for check-bundle-sync.mjs Layer 3 — packs integrity (REQ-04).
 *
 * packs-plugin-distribution slice A' / Task 4 (Wave 2).
 *
 * Verifies the new packs-completeness layer:
 *   L1: a bundle whose packs/manifest.json lists pms and has packs/pms/ present
 *       → check exits 0 (Layer 3 passes)
 *   L2: a bundle whose packs/manifest.json lists pms but packs/pms/ is removed
 *       → check exits 1 with a packs-integrity failure message
 *   L3: FORGE_SKIP_BUNDLE_SYNC=1 → skipped (exit 0, regardless of pack state)
 *   L4: manifest.json missing (old bundle / dev state) → warn + skip packs
 *       layer (exit 0, does not block — design §2.3 graceful path)
 *
 * The check-bundle-sync.mjs CLI is exercised end-to-end via spawnSync against a
 * temp fixture (CC bundle + plugin dist + hooks.json) so the whole layer wiring
 * is validated, not just an isolated function.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..");
const CHECK_SCRIPT = resolve(REPO_ROOT, "scripts/check-bundle-sync.mjs");

interface Fixture {
  tmpDir: string;
  ccBundle: string;
  pluginDist: string;
}

/**
 * Build a minimal on-disk fixture that satisfies check-bundle-sync's other
 * layers (Layer 1 needs hooks.json with no script refs → 0 scripts; Layer 2
 * needs dist-plugin/ to exist) so Layer 3 packs logic is what we're exercising.
 */
function buildFixture(opts: { withPacks: boolean; withManifest: boolean }): Fixture {
  const tmpDir = resolve(
    process.env.RUNNER_TEMP || process.env.TMPDIR || "/tmp",
    `forge-bsync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const ccBundle = resolve(tmpDir, "dist/claude-code/bundles/tinkerman");
  const pluginDist = resolve(tmpDir, "dist-plugin");
  const hooksDir = resolve(tmpDir, "hooks");

  mkdirSync(ccBundle, { recursive: true });
  mkdirSync(pluginDist, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });

  // Minimal hooks.json with zero script references → Layer 1 finds nothing
  writeFileSync(resolve(hooksDir, "hooks.json"), JSON.stringify({ hooks: {} }));

  if (opts.withPacks) {
    // Place a packs/pms/ with a pack.yaml in BOTH bundles (Layer 3 checks both)
    for (const bundle of [ccBundle, pluginDist]) {
      const pmsDir = resolve(bundle, "packs/pms");
      mkdirSync(pmsDir, { recursive: true });
      writeFileSync(resolve(pmsDir, "pack.yaml"), 'name: pms\nforge_min_version: "2.4.0"\n');
    }
  }
  if (opts.withManifest) {
    for (const bundle of [ccBundle, pluginDist]) {
      const packsDir = resolve(bundle, "packs");
      mkdirSync(packsDir, { recursive: true });
      writeFileSync(
        resolve(packsDir, "manifest.json"),
        JSON.stringify({
          generated_at: "2026-06-27T12:00:00.000Z",
          forge_version: "3.9.0",
          packs: [{ name: "pms", forge_min_version: "2.4.0", path: "packs/pms" }],
        }),
      );
    }
  }

  return { tmpDir, ccBundle, pluginDist };
}

function runCheck(cwd: string, envOverride: NodeJS.ProcessEnv = {}) {
  // CI=true so Layer 2 (build-presence) is skipped — we only want Layer 1+3.
  const env = { ...process.env, CI: "true", ...envOverride };
  const r = spawnSync(process.execPath, [CHECK_SCRIPT], { cwd, env, encoding: "utf-8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

describe("check-bundle-sync.mjs Layer 3 — packs integrity (REQ-04)", () => {
  let fixtures: Fixture[] = [];

  it("L1: manifest + packs present in both bundles → exit 0", () => {
    const fx = buildFixture({ withPacks: true, withManifest: true });
    fixtures.push(fx);
    const res = runCheck(fx.tmpDir);
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(0);
    expect(res.stdout).toContain("packs");
  });

  it("L2: manifest lists pms but packs/pms/ removed → exit 1 with packs failure", () => {
    const fx = buildFixture({ withPacks: true, withManifest: true });
    fixtures.push(fx);
    // Now remove the pms pack dir from BOTH bundles to break integrity
    rmSync(resolve(fx.ccBundle, "packs/pms"), { recursive: true, force: true });
    rmSync(resolve(fx.pluginDist, "packs/pms"), { recursive: true, force: true });
    const res = runCheck(fx.tmpDir);
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(1);
    expect(res.stdout.toLowerCase()).toMatch(/pack/);
  });

  it("L3: FORGE_SKIP_BUNDLE_SYNC=1 → skipped (exit 0) even if packs broken", () => {
    const fx = buildFixture({ withPacks: false, withManifest: true });
    fixtures.push(fx);
    const res = runCheck(fx.tmpDir, { FORGE_SKIP_BUNDLE_SYNC: "1" });
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(0);
    expect(res.stdout.toLowerCase()).toContain("skip");
  });

  it("L4: manifest missing → warn + skip packs layer (exit 0, graceful)", () => {
    const fx = buildFixture({ withPacks: false, withManifest: false });
    fixtures.push(fx);
    const res = runCheck(fx.tmpDir);
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(0);
  });

  it("L5: packs present in CC but missing in plugin dist → exit 1", () => {
    // Asymmetry regression: both bundles must carry packs (plugin install path)
    const fx = buildFixture({ withPacks: true, withManifest: true });
    fixtures.push(fx);
    rmSync(resolve(fx.pluginDist, "packs/pms"), { recursive: true, force: true });
    const res = runCheck(fx.tmpDir);
    expect(res.status, `stdout: ${res.stdout}\nstderr: ${res.stderr}`).toBe(1);
  });

  // Cleanup all temp dirs after the suite
  it("cleanup", () => {
    for (const fx of fixtures) {
      rmSync(fx.tmpDir, { recursive: true, force: true });
    }
    fixtures = [];
    expect(true).toBe(true);
  });
});
