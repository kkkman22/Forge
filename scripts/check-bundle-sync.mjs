#!/usr/bin/env node
/**
 * check-bundle-sync.mjs — Verify dist package completeness and freshness.
 *
 * Layer 1 (completeness): Parse hooks/hooks.json, extract all referenced
 *   runtime scripts, verify each exists in both dist packages.
 * Layer 2 (build presence): dist-plugin/ exists on disk.
 * Layer 3 (packs integrity): manifest-declared packs exist & non-empty.
 * Layer 4 (src↔scripts parity): for .mjs scripts that intentionally cannot
 *   import dist (bootstrap-critical / self-contained-by-contract), assert the
 *   shared constants/regexes match their src/*.ts counterpart. Catches drift
 *   where tests cover src but CI/hooks run the .mjs mirror. P1-3.
 *
 * Exit 0 if clean, exit 1 if drift found.
 * Skippable via FORGE_SKIP_BUNDLE_SYNC=1 or [bundle-sync-skip] in commit message.
 *
 * @see check-dist-sync.mjs (TypeScript compilation sync — sibling concern)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CC_BUNDLE = "dist/claude-code/bundles/forge";
const PLUGIN_DIST = "dist-plugin";
const HOOKS_JSON = "hooks/hooks.json";

// Scripts that are TypeScript compilation outputs, not scripts/ files
const COMPILED_JS = new Set(["check-sandbox.js", "sandbox-active.js"]);

// ── Logging ──────────────────────────────────────────────────────────
function log(msg) {
  process.stdout.write(`${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`${msg}\n`);
}

// ── Skip check ───────────────────────────────────────────────────────
function checkSkip() {
  if (process.env.FORGE_SKIP_BUNDLE_SYNC === "1") {
    log("⚠️  bundle-sync: SKIPPED (FORGE_SKIP_BUNDLE_SYNC=1)");
    return true;
  }
  try {
    const msg = execSync("git log -1 --format=%B", { encoding: "utf-8" }).trim();
    if (msg.includes("[bundle-sync-skip]")) {
      log("⚠️  bundle-sync: SKIPPED ([bundle-sync-skip] in commit message)");
      return true;
    }
  } catch {
    // no commits yet — skip
  }
  return false;
}

// ── Extract script names from hooks.json ─────────────────────────────
function extractHookScripts(hooksPath) {
  const raw = execSync(`cat "${hooksPath}"`, { encoding: "utf-8" });
  const hooks = JSON.parse(raw);

  const scripts = new Set();
  // Match scripts/ subpath including subdirectories (e.g. cmux-mirror/sync-once.mjs)
  const scriptPathRe = /scripts\/([\w][\w/.-]+\.(?:sh|mjs|js))/g;
  // Fallback: bare filenames without scripts/ prefix
  const bareScriptRe = /([\w][\w.-]+\.(?:sh|mjs|js))/g;

  function walkCommands(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) walkCommands(item);
      return;
    }
    if (typeof obj.command === "string") {
      // First try to extract full scripts/... path
      const pathMatches = [...obj.command.matchAll(scriptPathRe)];
      if (pathMatches.length > 0) {
        for (const m of pathMatches) {
          const rel = m[1]; // e.g. "cmux-mirror/sync-once.mjs" or "auto-resume.sh"
          const basename = rel.split("/").pop();
          if (COMPILED_JS.has(basename)) continue;
          scripts.add(rel);
        }
      } else {
        // Fallback to bare filename matching
        for (const m of obj.command.matchAll(bareScriptRe)) {
          const name = m[1];
          if (COMPILED_JS.has(name)) continue;
          if (/^(grep|sed|awk|head|tail|cat|echo|sort|find|wc|tr)$/.test(name.replace(/\.\w+$/, "")))
            continue;
          scripts.add(name);
        }
      }
    }
    for (const val of Object.values(obj)) {
      if (typeof val === "object") walkCommands(val);
    }
  }

  walkCommands(hooks);
  return scripts;
}

// ── Layer 1: Completeness ────────────────────────────────────────────
function checkCompleteness(scripts) {
  const missing = [];

  for (const script of scripts) {
    // script may be "auto-resume.sh" or "cmux-mirror/sync-once.mjs"
    // Check in CC bundle
    const ccPath = resolve(CC_BUNDLE, "scripts", script);
    if (!existsSync(ccPath)) {
      missing.push({ script, bundle: "CC bundle", path: ccPath });
    }

    // Check in Plugin dist
    const pluginPath = resolve(PLUGIN_DIST, "scripts", script);
    if (!existsSync(pluginPath)) {
      missing.push({ script, bundle: "Plugin dist", path: pluginPath });
    }
  }

  if (missing.length > 0) {
    log("❌ bundle-sync: completeness check FAILED\n");
    log("── Scripts referenced in hooks.json but MISSING from dist ──");
    for (const m of missing) {
      log(`  ${m.script} — missing in ${m.bundle}`);
    }
    log("");
  }

  return missing;
}

// ── Layer 2: Build presence ──────────────────────────────────────────
function checkBuildPresence() {
  // dist/ and dist-plugin/ are gitignored and rebuilt on demand, so a git-diff
  // freshness check no longer applies. Instead, verify the build outputs exist
  // on disk — a missing dist-plugin/ means build-dist.sh was never run and the
  // dist-plugin-dependent tests would fail.
  if (process.env.CI === "true") {
    log("bundle-sync: build-presence check SKIPPED (CI environment — dist just rebuilt)");
    return null;
  }
  const missing = [];
  if (!existsSync(PLUGIN_DIST)) missing.push(PLUGIN_DIST);
  if (missing.length > 0) {
    log("❌ bundle-sync: build-presence check FAILED\n");
    log("── dist-plugin/ not built (gitignored, required by tests) ──");
    for (const m of missing) {
      log(`  ${m}`);
    }
    log("");
    log("Fix: bash scripts/build-dist.sh");
    log("");
    return missing;
  }
  return null;
}

// ── Layer 3: Packs integrity ────────────────────────────────────────
// REQ-04 (packs-plugin-distribution slice A'). Verify that every pack listed
// in the bundle's packs/manifest.json actually exists and is non-empty in BOTH
// dist packages (CC bundle + plugin dist). manifest.json is the single source
// of truth for which packs shipped with this Forge version; a bundle that
// declares a pack but lacks it is drift that init.sh would otherwise surface
// only as a runtime warn. If manifest.json is absent (old bundle / dev state
// with no packs shipped), Layer 3 warns and does not block — graceful, mirrors
// the existing "hooks.json not found → skip" behavior.
function readPacksManifest(bundleDir) {
  const manifestPath = resolve(bundleDir, "packs", "manifest.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = execSync(`cat "${manifestPath}"`, { encoding: "utf-8" });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function checkPacksIntegrity() {
  const missing = [];
  // Mirror Layer 1: assert in BOTH bundles (plugin installs ship from
  // dist-plugin, so a pack missing there breaks /forge init --pack just as
  // much as missing in CC bundle).
  for (const [bundleLabel, bundleDir] of [
    ["CC bundle", CC_BUNDLE],
    ["Plugin dist", PLUGIN_DIST],
  ]) {
    const manifest = readPacksManifest(bundleDir);
    if (manifest === null) {
      // Graceful: no manifest → no packs shipped with this bundle, skip.
      // Don't warn per-bundle to avoid noise when neither bundle has packs.
      continue;
    }
    if (!manifest.packs || !Array.isArray(manifest.packs)) {
      missing.push({ pack: "<invalid manifest.json>", bundle: bundleLabel, path: `${bundleDir}/packs/manifest.json` });
      continue;
    }
    for (const entry of manifest.packs) {
      if (!entry || typeof entry.name !== "string" || typeof entry.path !== "string") continue;
      const packPath = resolve(bundleDir, entry.path);
      // Non-empty = at least one regular file (catches empty-dir stubs)
      const isEmpty = !existsSync(packPath) || (() => {
        try {
          return execSync(`find "${packPath}" -type f | head -1`, { encoding: "utf-8" }).trim() === "";
        } catch {
          return true;
        }
      })();
      if (isEmpty) {
        missing.push({ pack: entry.name, bundle: bundleLabel, path: packPath });
      }
    }
  }

  if (missing.length > 0) {
    log("❌ bundle-sync: packs-integrity check FAILED\n");
    log("── Packs declared in manifest.json but MISSING/EMPTY in dist ──");
    for (const m of missing) {
      log(`  ${m.pack} — missing/empty in ${m.bundle} (${m.path})`);
    }
    log("");
    log("Fix: bash scripts/build-dist.sh");
    log("");
  }
  return missing;
}

// ── Layer 4: src↔scripts parity (P1-3) ────────────────────────────────
//
// For .mjs scripts that intentionally inline logic (bootstrap-critical or
// self-contained-by-contract), assert the shared constants match their
// src/*.ts counterpart. A mismatch means src was edited + tests passed, but
// the running .mjs still uses the old value → silent drift.
//
// Each entry: { mjs, ts, checks: [{ name, extract }] } where extract(text)
// returns the canonical form of the shared value from the file text. The two
// extracts must be equal.
const PARITY_ASSERTIONS = [
  {
    mjs: "scripts/compact-inject.mjs",
    ts: "src/token-estimate.ts",
    checks: [
      {
        name: "token formula LATIN_CHARS_PER_TOKEN",
        // mjs: Math.ceil(text.length / 4) — Latin baseline (compact-inject is a
        //   self-contained hook, cannot CJK-weight without dist; uses the Latin
        //   ratio as the conservative base).
        // ts:  const LATIN_CHARS_PER_TOKEN = 4 — the canonical Latin ratio.
        // These must match so the hook's rough size hint agrees with the
        // canonical estimator's Latin component.
        extractMjs: (t) => {
          const m = t.match(/Math\.ceil\(\s*text\.length\s*\/\s*(\d+)\s*\)/);
          return m ? `/${m[1]}` : null;
        },
        extractTs: (t) => {
          const m = t.match(/LATIN_CHARS_PER_TOKEN\s*=\s*(\d+)/);
          return m ? `/${m[1]}` : null;
        },
      },
    ],
  },
];

function checkScriptSrcParity() {
  const issues = [];
  for (const entry of PARITY_ASSERTIONS) {
    const mjsPath = resolve(process.cwd(), entry.mjs);
    const tsPath = resolve(process.cwd(), entry.ts);
    if (!existsSync(mjsPath) || !existsSync(tsPath)) continue;
    const mjsText = readFileSync(mjsPath, "utf-8");
    const tsText = readFileSync(tsPath, "utf-8");
    for (const check of entry.checks) {
      const mjsVal = check.extractMjs(mjsText);
      const tsVal = check.extractTs(tsText);
      if (tsVal === null) continue; // mjs-only or unparseable — skip
      if (mjsVal !== tsVal) {
        issues.push({
          file: entry.mjs,
          check: check.name,
          message: `parity drift: mjs="${mjsVal}" ts="${tsVal}" — edit src/${entry.ts.split("/").pop()} then sync ${entry.mjs}`,
        });
      }
    }
  }
  return issues;
}

// ── Main ─────────────────────────────────────────────────────────────
function main() {
  if (checkSkip()) {
    process.exit(0);
  }

  const cwd = process.cwd();
  const hooksPath = resolve(cwd, HOOKS_JSON);

  if (!existsSync(hooksPath)) {
    log("⚠️  bundle-sync: hooks.json not found, skipping");
    process.exit(0);
  }

  let totalIssues = 0;

  // Layer 1: Completeness
  const scripts = extractHookScripts(hooksPath);
  log(`bundle-sync: checking ${scripts.size} scripts from hooks.json...`);
  const missing = checkCompleteness(scripts);
  totalIssues += missing.length;

  // Layer 2: Build presence (dist-plugin exists on disk)
  log("bundle-sync: checking dist-plugin build presence...");
  const stale = checkBuildPresence();
  if (stale) totalIssues += stale.length;

  // Layer 3: Packs integrity (manifest-declared packs exist & non-empty in both bundles)
  log("bundle-sync: checking packs integrity (manifest.json)...");
  const missingPacks = checkPacksIntegrity();
  totalIssues += missingPacks.length;

  // Layer 4: src↔scripts parity (P1-3) — shared constants match across .mjs/.ts
  log("bundle-sync: checking src↔scripts parity (non-thin-shell mirrors)...");
  const parityIssues = checkScriptSrcParity();
  if (parityIssues.length > 0) {
    for (const p of parityIssues) {
      logError(`  [${p.check}] ${p.file}`);
      logError(`      ${p.message}`);
    }
    log("");
  }
  totalIssues += parityIssues.length;

  if (totalIssues > 0) {
    process.exit(1);
  }

  log(
    `bundle-sync: OK — ${scripts.size} scripts verified, dist-plugin present, packs intact, src↔scripts parity clean`,
  );
  process.exit(0);
}

main();
