#!/usr/bin/env node
// category: internal-only
/**
 * sync-command-registry.mjs
 *
 * Single generation chain for Forge subcommands:
 * skills/tinkerman/lib/<sub>/instructions.md frontmatter
 *   -> skills/tinkerman/registry.toml
 *   -> src/forge-dispatcher/allowlist.ts
 *   -> docs/_ssot/commands.json
 *   -> .claude-plugin metadata
 *   -> skills/tinkerman/SKILL.md derived counts
 *
 * Usage:
 *   node scripts/sync-command-registry.mjs
 *   node scripts/sync-command-registry.mjs --check
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LIB_DIR = join(ROOT, "skills", "tinkerman", "lib");
const REGISTRY_PATH = join(ROOT, "skills", "tinkerman", "registry.toml");
const ALLOWLIST_PATH = join(ROOT, "src", "forge-dispatcher", "allowlist.ts");
const COMMANDS_SSOT_PATH = join(ROOT, "docs", "_ssot", "commands.json");
const PLUGIN_JSON_REL = ".claude-plugin/plugin.json";
const MARKETPLACE_JSON_REL = ".claude-plugin/marketplace.json";
const PLUGIN_JSON_PATH = join(ROOT, PLUGIN_JSON_REL);
const MARKETPLACE_JSON_PATH = join(ROOT, MARKETPLACE_JSON_REL);
const SKILL_MD_PATH = join(ROOT, "skills", "tinkerman", "SKILL.md");

const CHECK_ONLY = process.argv.includes("--check") || process.argv.includes("--check-only");

const FULL_SEQUENCE = new Set(["decide", "spec", "plan", "build", "review", "test", "ship", "learn"]);
const STANDARD_SEQUENCE = new Set(["plan", "build", "review", "test", "ship"]);
const LIGHT_SEQUENCE = new Set(["build", "review"]);

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const text = match[1];
  const fm = {};
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (rest.startsWith("[") && rest.endsWith("]")) {
      fm[key] = rest
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      i++;
      continue;
    }

    if (rest === "" && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
      const items = [];
      i++;
      while (i < lines.length && /^\s+-\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s+-\s+/, "").trim());
        i++;
      }
      fm[key] = items;
      continue;
    }

    fm[key] = rest.replace(/^["']|["']$/g, "");
    i++;
  }

  return fm;
}

function tierFor(name) {
  if (name === "build-light") return "light";
  if (LIGHT_SEQUENCE.has(name) && STANDARD_SEQUENCE.has(name) && FULL_SEQUENCE.has(name)) return "all";
  if (STANDARD_SEQUENCE.has(name) && FULL_SEQUENCE.has(name)) return "standard/full";
  if (FULL_SEQUENCE.has(name)) return "full";
  return "all";
}

function stageFor(name) {
  const stages = {
    decide: "decision",
    "decide-teams": "decision",
    spec: "specification",
    plan: "planning",
    build: "implementation",
    "build-light": "implementation",
    review: "review",
    "review-comment-bitbucket": "review",
    test: "verification",
    verify: "verification",
    accept: "acceptance",
    ship: "shipping",
    learn: "knowledge",
    debug: "debugging",
  };
  return stages[name] ?? "auxiliary";
}

function summarize(description) {
  const trimmed = String(description || "").trim();
  if (!trimmed) return "Forge subcommand.";
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function subsFromLib() {
  const entries = readdirSync(LIB_DIR, { withFileTypes: true });
  const subs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const instrPath = join(LIB_DIR, entry.name, "instructions.md");
    if (!existsSync(instrPath)) continue;
    const content = readFileSync(instrPath, "utf-8");
    const fm = parseFrontmatter(content);
    const name = entry.name;
    subs.push({
      name,
      dispatch_mode: fm.dispatch_mode || "inline",
      allowed_tools: Array.isArray(fm.allowed_tools) ? fm.allowed_tools : [],
      description: fm.description || "",
      tier: tierFor(name),
      stage: stageFor(name),
      summary: summarize(fm.description || ""),
    });
  }

  return subs.sort((a, b) => a.name.localeCompare(b.name));
}

function generateToml(subs) {
  const lines = [
    "# AUTO-GENERATED - DO NOT EDIT",
    "# Source: skills/tinkerman/lib/<sub>/instructions.md frontmatter",
    "# Regen: node scripts/sync-command-registry.mjs",
    "",
  ];

  for (const sub of subs) {
    lines.push(`[${sub.name}]`);
    lines.push(`dispatch_mode = ${JSON.stringify(sub.dispatch_mode)}`);
    lines.push(`tier = ${JSON.stringify(sub.tier)}`);
    lines.push(`stage = ${JSON.stringify(sub.stage)}`);
    lines.push(`allowed_tools = [${sub.allowed_tools.map((t) => JSON.stringify(t)).join(", ")}]`);
    lines.push(`description = ${JSON.stringify(sub.description)}`);
    lines.push(`summary = ${JSON.stringify(sub.summary)}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function generateAllowlist(subs) {
  const names = subs.map((s) => s.name);
  return `// AUTO-GENERATED - DO NOT EDIT\n// Source: skills/tinkerman/registry.toml\n// Regen: node scripts/sync-command-registry.mjs\n\nconst ALLOW_LIST: ReadonlyArray<string> = [\n${names.map((name) => `  ${JSON.stringify(name)},`).join("\n")}\n] as const;\n\nexport type ValidatedSub = (typeof ALLOW_LIST)[number];\n\nexport interface AllowResult {\n  ok: true;\n  value: ValidatedSub;\n}\n\nexport interface RejectResult {\n  ok: false;\n  code: "E_UNKNOWN_SUB";\n  suggestion?: string;\n}\n\nexport type TopicValidationResult = AllowResult | RejectResult;\n\nfunction levenshtein(a: string, b: string): number {\n  const m = a.length;\n  const n = b.length;\n  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));\n  for (let i = 0; i <= m; i++) dp[i][0] = i;\n  for (let j = 0; j <= n; j++) dp[0][j] = j;\n  for (let i = 1; i <= m; i++) {\n    for (let j = 1; j <= n; j++) {\n      dp[i][j] =\n        a[i - 1] === b[j - 1]\n          ? dp[i - 1][j - 1]\n          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);\n    }\n  }\n  return dp[m][n];\n}\n\nexport function validateTopic(topic: string): TopicValidationResult {\n  const trimmed = topic.trim();\n\n  if ((ALLOW_LIST as readonly string[]).includes(trimmed)) {\n    return { ok: true, value: trimmed as ValidatedSub };\n  }\n\n  let bestMatch = "";\n  let bestDist = Infinity;\n  for (const sub of ALLOW_LIST) {\n    const dist = levenshtein(trimmed, sub);\n    if (dist < bestDist) {\n      bestDist = dist;\n      bestMatch = sub;\n    }\n  }\n\n  return {\n    ok: false,\n    code: "E_UNKNOWN_SUB",\n    suggestion: bestDist <= 3 ? bestMatch : undefined,\n  };\n}\n\nexport { ALLOW_LIST };\n`;
}

function generateCommandsJson(subs) {
  const commands = subs.map((s) => ({
    name: `/tinkerman ${s.name}`,
    tier: s.tier,
    stage: s.stage,
    dispatch_mode: s.dispatch_mode,
    summary: s.summary,
  }));
  return `${JSON.stringify(commands, null, 2)}\n`;
}

function updateJsonFileContent(path, updater) {
  const data = JSON.parse(readFileSync(path, "utf-8"));
  updater(data);
  return `${JSON.stringify(data, null, 2)}\n`;
}

function generatePluginJson(count) {
  return updateJsonFileContent(PLUGIN_JSON_PATH, (data) => {
    data.description = `Unified AI coding workflow framework - single /tinkerman slash command with ${count} internal subcommands, TDD, spec-driven planning, and automated review.`;
  });
}

function generateMarketplaceJson(count) {
  return updateJsonFileContent(MARKETPLACE_JSON_PATH, (data) => {
    data.description = `Forge official marketplace - unified AI coding workflow framework with ${count} internal subcommands, TDD, spec-driven planning, automated review, and three-tier task routing.`;
    if (Array.isArray(data.plugins) && data.plugins[0]) {
      data.plugins[0].description = `Unified AI coding workflow framework - single /tinkerman slash command with ${count} internal subcommands, TDD, spec-driven planning, and automated review.`;
    }
  });
}

function generateSkillMd(subs) {
  const count = subs.length;
  const forkCount = subs.filter((s) => s.dispatch_mode === "fork").length;
  const inlineCount = subs.filter((s) => s.dispatch_mode === "inline").length;
  let content = readFileSync(SKILL_MD_PATH, "utf-8");
  content = content.replace(/routes to \d+ sub-skills/g, `routes to ${count} sub-skills`);
  content = content.replace(/All \d+ sub-skills live/g, `All ${count} sub-skills live`);
  content = content.replace(/\d+-sub allowlist/g, `${count}-sub allowlist`);
  content = content.replace(/\*\*fork\*\* \(\d+ subs\)/g, `**fork** (${forkCount} subs)`);
  content = content.replace(/\*\*inline\*\* \(\d+ subs\)/g, `**inline** (${inlineCount} subs)`);
  return content;
}

function expectedFiles(subs) {
  const count = subs.length;
  return new Map([
    [REGISTRY_PATH, generateToml(subs)],
    [ALLOWLIST_PATH, generateAllowlist(subs)],
    [COMMANDS_SSOT_PATH, generateCommandsJson(subs)],
    [PLUGIN_JSON_PATH, generatePluginJson(count)],
    [MARKETPLACE_JSON_PATH, generateMarketplaceJson(count)],
    [SKILL_MD_PATH, generateSkillMd(subs)],
  ]);
}

const subs = subsFromLib();
const files = expectedFiles(subs);

if (CHECK_ONLY) {
  const stale = [];
  for (const [path, expected] of files) {
    const actual = existsSync(path) ? readFileSync(path, "utf-8") : "";
    if (actual !== expected) stale.push(path.replace(`${ROOT}/`, ""));
  }
  if (stale.length > 0) {
    console.error(`command registry derived files are stale:\n${stale.map((p) => `- ${p}`).join("\n")}`);
    console.error("Regenerate with: node scripts/sync-command-registry.mjs");
    process.exit(1);
  }
  console.log(`command registry derived files are up to date (${subs.length} subcommands)`);
  process.exit(0);
}

for (const [path, content] of files) {
  writeFileSync(path, content);
}

console.log(`command registry synced (${subs.length} subcommands)`);
