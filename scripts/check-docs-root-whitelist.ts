#!/usr/bin/env node
/**
 * Root whitelist checker — validates that root .md files match the whitelist.
 * Exit codes: 0 = clean, 1 = violation, 3 = internal error.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkRootWhitelist } from "../src/docs-governance/root-whitelist.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { commonHelp } from "../src/docs-governance/cli/_help.js";

const SCRIPT_NAME = "check-docs-root-whitelist";

const DEFAULT_WHITELIST = [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "ROADMAP.md",
  "AGENTS.md",
  "CLAUDE.md",
  "LICENSE.md",
] as const;

function loadWhitelistFromConfig(rootDir: string): readonly string[] {
  const configPath = resolve(rootDir, ".forge/config.md");
  try {
    const raw = readFileSync(configPath, "utf-8");
    // Extract YAML between frontmatter delimiters
    let content = raw;
    if (content.startsWith("---")) {
      const secondDash = content.indexOf("---", 3);
      if (secondDash !== -1) {
        content = content.slice(3, secondDash);
      }
    }
    // Simple parse: look for root_whitelist array
    const lines = content.split("\n");
    let inWhitelist = false;
    const items: string[] = [];
    for (const line of lines) {
      if (line.trim() === "root_whitelist:") {
        inWhitelist = true;
        continue;
      }
      if (inWhitelist) {
        const match = line.match(/^\s+-\s+"?([^"]+)"?\s*$/);
        if (match) {
          items.push(match[1]);
        } else if (!line.match(/^\s*$/)) {
          inWhitelist = false;
        }
      }
    }
    return items.length > 0 ? items : DEFAULT_WHITELIST;
  } catch {
    return DEFAULT_WHITELIST;
  }
}

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    commonHelp(SCRIPT_NAME, "Check that root-level .md files match the whitelist."),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");
const rootDir = resolve(process.cwd());

const result = computeExitResult(() => {
  const whitelist = loadWhitelistFromConfig(rootDir);
  return checkRootWhitelist(rootDir, whitelist);
});

if (jsonMode) {
  process.stdout.write(`${formatNdjson(result.diagnostics)}\n`);
} else {
  const output = formatDiagnostics(result.diagnostics);
  process.stdout.write(`${output}\n`);
}

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
}

process.exit(result.exitCode);
