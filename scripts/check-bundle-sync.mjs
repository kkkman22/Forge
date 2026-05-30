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

// ── Layer 2: Freshness ───────────────────────────────────────────────
function checkFreshness() {
  // In CI, build-dist.sh just ran — freshness check is meaningless (zip is non-deterministic)
  if (process.env.CI === "true") {
    log("bundle-sync: freshness check SKIPPED (CI environment — dist just rebuilt)");
    return null;
  }
  try {
    execSync("git diff --exit-code -- dist/ dist-plugin/", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    return null; // clean
  } catch (e) {
    const diff = e.stdout || "";
    if (!diff.trim()) return null; // no actual diff

    // Parse diff stat for summary
    const files = diff
      .split("\n")
      .filter((l) => l.startsWith("diff --git"))
      .map((l) => l.replace(/^diff --git a\/.* b\//, ""));

    log("❌ bundle-sync: freshness check FAILED\n");
    log("── Dist packages are STALE (source changed but dist not rebuilt) ──");
    for (const f of files) {
      log(`  ${f}`);
    }
    log("");
    log("Fix: bash scripts/build-dist.sh && git add dist/ dist-plugin/");
    log("");
    return files;
  }
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

  // Layer 2: Freshness
  log("bundle-sync: checking dist freshness (git diff)...");
  const stale = checkFreshness();
  if (stale) totalIssues += stale.length;

  if (totalIssues > 0) {
    process.exit(1);
  }

  log(`bundle-sync: OK — ${scripts.size} scripts verified, dist packages fresh`);
  process.exit(0);
}

main();
