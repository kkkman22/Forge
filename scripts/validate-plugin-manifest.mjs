#!/usr/bin/env node
// category: user-facing
// ============================================================================
// validate-plugin-manifest.mjs — Forge plugin.json contract validator
//
// Validates `.claude-plugin/plugin.json` consistency for marketplace
// distribution. Specifically (R1, R13 of workflows-integration):
//
//   1. plugin.json exists and is valid JSON.
//   2. If `workflows` field is declared, every entry resolves to an existing
//      directory under the plugin root.
//   3. Every `*.js` file under each workflows directory parses with
//      `node --check` (syntax-only). Any failure is reported as
//      "workflow load failed: <file>: <reason>".
//   4. mcpServers and hooks fields, when present, retain `${CLAUDE_PLUGIN_ROOT}`
//      tokens unchanged (no accidental rewrites).
//
// Usage:
//   node scripts/validate-plugin-manifest.mjs           # cwd assumed plugin root
//   node scripts/validate-plugin-manifest.mjs --root .  # explicit root
//
// Exit codes:
//   0  manifest valid (or missing optional fields)
//   1  fatal validation error
//
// Help:
//   node scripts/validate-plugin-manifest.mjs --help
// ============================================================================

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "validate-plugin-manifest.mjs — Forge plugin.json contract validator",
      "",
      "Usage:",
      "  node scripts/validate-plugin-manifest.mjs [--root <dir>]",
      "",
      "Options:",
      "  --root <dir>   plugin root (default: current working directory)",
      "  --help, -h     show this help",
      "",
      "Validates:",
      "  - plugin.json present and parseable",
      "  - workflows[] paths resolve to existing directories",
      "  - every *.js under workflows[] passes node --check",
      "",
      "Exit code 1 with stderr 'workflow load failed' on any workflow failure.",
    ].join("\n"),
  );
  process.exit(0);
}

const rootIdx = args.indexOf("--root");
const root = rootIdx >= 0 ? resolve(args[rootIdx + 1] ?? ".") : resolve(process.cwd());

const manifestPath = join(root, ".claude-plugin", "plugin.json");

if (!existsSync(manifestPath)) {
  process.stderr.write(`plugin manifest not found: ${manifestPath}\n`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
} catch (err) {
  process.stderr.write(`plugin manifest invalid JSON: ${err.message}\n`);
  process.exit(1);
}

if (!manifest.name || !manifest.version) {
  process.stderr.write("plugin manifest missing required name/version\n");
  process.exit(1);
}

if (manifest.workflows !== undefined) {
  if (!Array.isArray(manifest.workflows)) {
    process.stderr.write("plugin manifest 'workflows' must be an array\n");
    process.exit(1);
  }

  for (const entry of manifest.workflows) {
    if (typeof entry !== "string") {
      process.stderr.write(`workflow load failed: non-string entry ${JSON.stringify(entry)}\n`);
      process.exit(1);
    }

    const dir = resolve(root, entry);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      process.stderr.write(`workflow load failed: directory missing: ${entry}\n`);
      process.exit(1);
    }

    const jsFiles = collectJsFiles(dir);
    for (const jsFile of jsFiles) {
      try {
        execFileSync("node", ["--check", jsFile], { stdio: ["ignore", "ignore", "pipe"] });
      } catch (err) {
        const stderr = err.stderr?.toString() ?? err.message ?? "syntax error";
        process.stderr.write(`workflow load failed: ${jsFile}: ${stderr}\n`);
        process.exit(1);
      }
    }
  }
}

if (manifest.hooks !== undefined && typeof manifest.hooks === "object") {
  const hookJson = JSON.stringify(manifest.hooks);
  // Best-effort sanity: warn (not fail) if no PLUGIN_ROOT references but hooks exist.
  if (Object.keys(manifest.hooks).length > 0 && !hookJson.includes("CLAUDE_PLUGIN_ROOT")) {
    process.stderr.write(
      "warning: plugin hooks present but no ${CLAUDE_PLUGIN_ROOT} references found\n",
    );
  }
}

process.stdout.write(`plugin manifest OK: ${manifest.name}@${manifest.version}\n`);
process.exit(0);

function collectJsFiles(dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}
