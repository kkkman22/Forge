#!/usr/bin/env node
/**
 * check-bundle-sync.mjs — Verify dist package completeness and freshness.
 *
 * Layer 1 (completeness): Parse hooks/hooks.json, extract all referenced
 *   runtime scripts, verify each exists in both dist packages.
 * Layer 2 (freshness): Run `git diff --exit-code -- dist/ dist-plugin/`
 *   to detect stale committed dist after a source change.
 *
 * Exit 0 if clean, exit 1 if drift found.
 * Skippable via FORGE_SKIP_BUNDLE_SYNC=1 or [bundle-sync-skip] in commit message.
 *
 * @see check-dist-sync.mjs (TypeScript compilation sync — sibling concern)
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
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

  if (totalIssues > 0) {
    process.exit(1);
  }

  log(`bundle-sync: OK — ${scripts.size} scripts verified, dist-plugin present, packs intact`);
  process.exit(0);
}

main();
