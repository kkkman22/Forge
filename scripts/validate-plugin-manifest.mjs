#!/usr/bin/env node

/**
 * validate-plugin-manifest.mjs — Validate plugin.json workflows field
 *
 * Usage: node scripts/validate-plugin-manifest.mjs
 * Exit 0 = valid, non-zero = invalid.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = join(ROOT, ".claude-plugin", "plugin.json");

let errors = 0;

function fail(msg) {
  process.stderr.write(`FAIL: ${msg}\n`);
  errors++;
}

try {
  const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));

  // workflows field
  if (!plugin.workflows) {
    fail("plugin.json missing 'workflows' field");
  } else {
    if (!Array.isArray(plugin.workflows)) {
      fail("'workflows' must be an array");
    } else {
      for (const wfPath of plugin.workflows) {
        const absPath = join(ROOT, wfPath);
        if (!existsSync(absPath)) {
          fail(`workflows directory not found: ${wfPath}`);
          continue;
        }

        const jsFiles = readdirSync(absPath).filter((f) => f.endsWith(".js"));
        if (jsFiles.length === 0) {
          fail(`no .js files in workflows directory: ${wfPath}`);
        }

        for (const file of jsFiles) {
          const fullPath = join(absPath, file);
          try {
            execSync(`node --check "${fullPath}"`, { stdio: "pipe" });
          } catch {
            fail(`workflow file syntax error: ${join(wfPath, file)}`);
          }
        }
      }
    }
  }

  // Existing fields still valid
  if (!plugin.name) fail("plugin.json missing 'name'");
  if (!plugin.hooks) fail("plugin.json missing 'hooks'");
  if (!plugin.mcpServers) fail("plugin.json missing 'mcpServers'");
} catch (err) {
  fail(`failed to parse plugin.json: ${err.message}`);
}

if (errors > 0) {
  process.stderr.write(`\n${errors} error(s) found\n`);
  process.exit(1);
}

process.stdout.write("plugin.json validation passed\n");
process.exit(0);
