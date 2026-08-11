#!/usr/bin/env node

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

const DISPATCH_MODES = {
  abort: "inline",
  accept: "fork",
  build: "fork",
  "build-light": "inline",
  "control-cli": "inline",
  "control-ui": "inline",
  debug: "fork",
  decide: "fork",
  "decide-teams": "fork",
  fix: "inline",
  "fix-conflicts": "inline",
  grill: "fork",
  learn: "fork",
  loop: "fork",
  mutate: "fork",
  pack: "fork",
  plan: "fork",
  recap: "fork",
  refactor: "inline",
  resume: "inline",
  review: "fork",
  router: "inline",
  ship: "fork",
  spec: "fork",
  status: "inline",
  storm: "fork",
  test: "fork",
  verify: "inline",
  "zoom-out": "fork",
};

const ALLOWED_TOOLS = {
  abort: ["Read", "Bash", "Write"],
  accept: ["Read", "Bash", "Write"],
  build: ["Read", "Edit", "Write", "Bash", "Agent", "Glob", "Grep"],
  "build-light": ["Read", "Edit", "Write", "Bash"],
  "control-cli": ["Read", "Bash"],
  "control-ui": ["Read", "Bash"],
  debug: ["Read", "Agent", "Glob", "Grep", "Bash"],
  decide: ["Read", "Agent", "Bash"],
  "decide-teams": ["Read", "Write", "Bash", "Agent"],
  fix: ["Read", "Write"],
  "fix-conflicts": ["Read", "Edit", "Bash"],
  grill: ["Read", "Agent"],
  learn: ["Read", "Agent", "Glob", "Grep", "Bash"],
  loop: ["Read", "Agent", "Bash"],
  mutate: ["Read", "Bash"],
  pack: ["Read", "Bash", "Write"],
  plan: ["Read", "Glob", "Grep", "Bash", "Write"],
  recap: ["Read", "Glob", "Grep", "Bash"],
  refactor: ["Read", "Write"],
  resume: ["Read", "Bash"],
  review: ["Read", "Agent", "Bash"],
  router: ["Read", "Glob", "Grep"],
  ship: ["Read", "Bash", "Write"],
  spec: ["Read", "Glob", "Grep", "Bash", "Write"],
  status: ["Read", "Bash"],
  storm: ["Read", "Write", "Agent"],
  test: ["Read", "Bash", "Write"],
  verify: ["Read", "Bash"],
  "zoom-out": ["Read", "Glob", "Grep"],
};

const FIELDS_TO_REMOVE = ["name", "disable-model-invocation", "skeleton_exempt_legacy"];
const SUBS = Object.keys(DISPATCH_MODES);

function run(cmd) {
  if (DRY_RUN) {
    console.log(`  [dry-run] ${cmd}`);
    return "";
  }
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8" });
}

function rewriteFrontmatter(content, sub) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return content;

  let frontmatter = fmMatch[1];
  const body = content.slice(fmMatch[0].length);

  // Remove fields
  for (const field of FIELDS_TO_REMOVE) {
    frontmatter = frontmatter.replace(new RegExp(`^${field}:.*\\n?`, "m"), "");
  }

  // Add dispatch_mode and allowed_tools
  const toolsYaml = ALLOWED_TOOLS[sub].map((t) => `  - ${t}`).join("\n");
  frontmatter += `\ndispatch_mode: ${DISPATCH_MODES[sub]}`;
  frontmatter += `\nallowed_tools:\n${toolsYaml}`;

  return `---\n${frontmatter.trim()}\n---${body}`;
}

function rewriteCrossRefs(dir) {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { recursive: true, withFileTypes: false });
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = join(dir, entry);
    if (!existsSync(filePath)) continue;

    let content = readFileSync(filePath, "utf-8");
    const original = content;

    // Pattern 1: ../tinkerman-<sub>/ → ../<sub>/
    content = content.replace(/\.\.\/tinkerman-([a-z][a-z0-9-]*)\//g, "../$1/");

    // Pattern 2: skills/tinkerman-<sub>/SKILL.md → ../<sub>/instructions.md
    content = content.replace(
      /skills\/tinkerman-([a-z][a-z0-9-]*)\/SKILL\.md/g,
      "../$1/instructions.md",
    );

    // Pattern 3: skills/tinkerman-<sub>/references/ → ../<sub>/references/
    content = content.replace(
      /skills\/tinkerman-([a-z][a-z0-9-]*)\/references\//g,
      "../$1/references/",
    );

    // Pattern 4: skills/tinkerman-<sub>/ (generic, must run last) → ../<sub>/
    content = content.replace(
      /skills\/tinkerman-([a-z][a-z0-9-]*)\//g,
      "../$1/",
    );

    if (content !== original && !DRY_RUN) {
      writeFileSync(filePath, content);
    } else if (content !== original && DRY_RUN) {
      console.log(`  [dry-run] rewrite refs in ${join(dir, entry)}`);
    }
  }
}

// Main
console.log(DRY_RUN ? "=== DRY RUN ===" : "=== EXECUTING MIGRATION ===");

// Ensure lib directory exists
const libDir = join(ROOT, "skills", "tinkerman", "lib");
if (!existsSync(libDir)) {
  run(`mkdir -p "${libDir}"`);
}

let migrated = 0;

for (const sub of SUBS) {
  const srcDir = join(ROOT, "skills", `forge-${sub}`);
  const destDir = join(libDir, sub);

  if (!existsSync(srcDir)) {
    console.log(`  SKIP ${sub}: source directory not found`);
    continue;
  }

  // Handle PoC residue: remove existing lib/<sub> if source also exists
  if (existsSync(destDir)) {
    console.log(`  CLEAN ${sub}: removing PoC residue at ${destDir}`);
    if (!DRY_RUN) {
      rmSync(destDir, { recursive: true, force: true });
    }
  }

  // Step 1: git mv directory
  run(`git mv "skills/tinkerman-${sub}" "skills/tinkerman/lib/${sub}"`);

  // Step 2: git mv SKILL.md → instructions.md
  const skillFile = join(destDir, "SKILL.md");
  const instrFile = join(destDir, "instructions.md");

  if (existsSync(skillFile) || DRY_RUN) {
    run(`git mv "skills/tinkerman/lib/${sub}/SKILL.md" "skills/tinkerman/lib/${sub}/instructions.md"`);
  }

  // Step 3: Rewrite frontmatter
  if (!DRY_RUN && existsSync(instrFile)) {
    const content = readFileSync(instrFile, "utf-8");
    const rewritten = rewriteFrontmatter(content, sub);
    writeFileSync(instrFile, rewritten);
  } else if (DRY_RUN) {
    console.log(`  [dry-run] rewrite frontmatter for ${sub}/instructions.md`);
  }

  // Step 4: Rewrite cross-lib references
  rewriteCrossRefs(destDir);

  migrated++;
}

console.log(`\n${migrated} directories to migrate`);
