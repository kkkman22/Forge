#!/usr/bin/env node
// category: user-facing
// ============================================================================
// bump-version — 同步更新所有版本文件，可选自动 commit + tag
//
// 用法:
//   node scripts/bump-version.mjs <version | patch | minor | major> [--commit] [--tag]
//
// 示例:
//   node scripts/bump-version.mjs minor                    # 仅更新版本文件 + 重建 dist
//   node scripts/bump-version.mjs minor --commit           # + git commit
//   node scripts/bump-version.mjs minor --commit --tag     # + commit + tag + push + GitHub Release
//   node scripts/bump-version.mjs 3.2.0 --commit --tag     # 指定版本号，一键发版
//
// --tag 触发的完整流程:
//   0. 预检 (工作树干净、tag 不存在、无跟踪的编译产物、tsc 编译通过)
//   1. 更新版本文件 + rebuild dist
//   2. git commit
//   3. git tag (annotated)
//   4. git push + push tag
//   5. gh release create (需要 gh CLI 已登录)
//
// 更新文件:
//   - package.json
//   - .claude-plugin/plugin.json
//   - dist/ (自动 rebuild; dist-plugin 不再跟踪，由 build-dist.sh 按需生成)
//   - CHANGELOG.md (自动从 conventional commits 生成变更条目)
// ============================================================================

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const VERSION_FILES = [
  "package.json",
  ".claude-plugin/plugin.json",
];

const BUMP_LEVELS = ["patch", "minor", "major"];

function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeJSON(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function resolveNewVersion(currentVersion, input) {
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(input)) {
    return input;
  }

  if (BUMP_LEVELS.includes(input)) {
    const parts = currentVersion.split("-")[0].split(".").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      console.error(`当前版本格式异常: ${currentVersion}`);
      process.exit(1);
    }
    if (input === "patch") parts[2]++;
    if (input === "minor") { parts[1]++; parts[2] = 0; }
    if (input === "major") { parts[0]++; parts[1] = 0; parts[2] = 0; }
    return parts.join(".");
  }

  return null;
}

function gitExec(cmd) {
  return execSync(`git ${cmd}`, { encoding: "utf-8", cwd: ROOT }).trim();
}

/**
 * Generate changelog body from conventional commits between two refs.
 * Groups: feat → Added, fix(security) → Fixed [SECURITY], fix → Fixed,
 * refactor/perf → Changed, docs → Changed, style/chore/ci → omitted.
 */
function generateChangelogFromCommits(fromRef, toRef = "HEAD") {
  const log = execSync(
    `git log ${fromRef}..${toRef} --oneline --no-merges --format="%s"`,
    { encoding: "utf-8", cwd: ROOT },
  ).trim();

  if (!log) return null;

  const groups = {
    added: [],
    fixed: [],
    security: [],
    changed: [],
    deprecated: [],
  };

  // Conventional commit: type(scope)!: description
  const CC_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.*)/;

  for (const line of log.split("\n")) {
    const match = line.match(CC_RE);
    if (!match) continue;
    const [, type, scope, breaking, desc] = match;
    const entry = scope ? `**${scope}**: ${desc}` : desc;

    if (type === "feat") {
      groups.added.push(entry);
    } else if (type === "fix" && scope === "security") {
      groups.security.push(entry);
    } else if (type === "fix") {
      groups.fixed.push(entry);
    } else if (type === "refactor" || type === "perf") {
      groups.changed.push(entry);
    } else if (type === "docs" && scope !== "spec") {
      // Only include non-spec docs changes
      groups.changed.push(entry);
    } else if (type === "deprecate" || type === "chore" && desc.toLowerCase().includes("deprecat")) {
      groups.deprecated.push(entry);
    }
    // style, ci, chore (non-deprecated) → skipped
  }

  const sections = [];
  if (groups.security.length) {
    sections.push("### Fixed\n\n" + groups.security.map((e) => `- **[SECURITY]** ${e}`).join("\n"));
  }
  if (groups.added.length) {
    sections.push("### Added\n\n" + groups.added.map((e) => `- ${e}`).join("\n"));
  }
  if (groups.changed.length) {
    sections.push("### Changed\n\n" + groups.changed.map((e) => `- ${e}`).join("\n"));
  }
  if (groups.deprecated.length) {
    sections.push("### Deprecated\n\n" + groups.deprecated.map((e) => `- ${e}`).join("\n"));
  }
  if (groups.fixed.length) {
    sections.push("### Fixed\n\n" + groups.fixed.map((e) => `- ${e}`).join("\n"));
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
}

// Canonical Keep a Changelog section ordering. Entries that don't match are
// appended in encounter order so we never silently drop a section.
const SECTION_ORDER = [
  "### Added",
  "### Changed",
  "### Deprecated",
  "### Removed",
  "### Fixed",
  "### Security",
];

/**
 * Parse a changelog body into an ordered map of section → entry lines.
 * A section is a line starting with `### `; entries are the bullet lines that
 * follow it until the next section (blank lines and indentation preserved).
 * @param {string|null} body
 * @returns {Map<string, string[]>}
 */
function parseSections(body) {
  const sections = new Map();
  if (!body) return sections;
  let current = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^###\s+(.+?)\s*$/);
    if (m) {
      current = `### ${m[1]}`;
      if (!sections.has(current)) sections.set(current, []);
    } else if (current !== null) {
      sections.get(current).push(line);
    }
  }
  // Trim trailing empty lines per section.
  for (const [k, v] of sections) {
    while (v.length > 0 && v[v.length - 1].trim() === "") v.pop();
  }
  return sections;
}

/**
 * Extract PR/commit refs (`#NNN`) from a changelog entry line.
 * Used to detect when an auto-generated terse summary describes the same PR a
 * manual detailed entry already covers, so the duplicate can be dropped.
 * @param {string} line
 * @returns {Set<string>}
 */
function extractRefs(line) {
  return new Set((line.match(/#\d+/g) || []).map((r) => r));
}

/**
 * Merge auto-generated changelog entries with manual [Unreleased] entries.
 *
 * Bug this fixes (v3.6.1 release): the old code concatenated the two bodies,
 * producing DUPLICATE section headers (two `### Fixed`) when both sources
 * described the same change. extractChangelogSection() then picked the first
 * (the terse auto-gen summary), burying the detailed manual block — including
 * critical user-facing migration notes.
 *
 * Merge rules:
 * 1. Collapse duplicate sections: one `### Fixed`, not two.
 * 2. Manual entries win: when a manual entry references a PR (`#NNN`) that an
 *    auto-gen entry also references, drop the auto-gen entry (the manual one is
 *    always more detailed — the author wrote it deliberately).
 * 3. Auto-gen entries for PRs NOT in the manual block are preserved (they
 *    capture changes the author forgot to document manually).
 * 4. Emit sections in canonical Keep a Changelog order.
 *
 * @param {string|null} autoEntries - from generateChangelogFromCommits()
 * @param {string|null} manualEntries - hand-written under [Unreleased]
 * @returns {string|null} merged body, or null if both inputs are null/empty
 */
export function mergeChangelogEntries(autoEntries, manualEntries) {
  if (!autoEntries && !manualEntries) return null;
  if (!autoEntries) return manualEntries;
  if (!manualEntries) return autoEntries;

  const auto = parseSections(autoEntries);
  const manual = parseSections(manualEntries);

  // Collect every PR/commit ref mentioned in ANY manual entry, across all
  // sections — a manual Added entry about #119 should still suppress a terse
  // auto-gen Fixed line about #119.
  const manualRefs = new Set();
  for (const lines of manual.values()) {
    for (const line of lines) {
      if (line.trim().startsWith("-")) {
        for (const r of extractRefs(line)) manualRefs.add(r);
      }
    }
  }

  const merged = new Map(manual);
  for (const [section, lines] of auto) {
    if (!merged.has(section)) {
      // Section only in auto-gen — keep it whole.
      merged.set(section, lines);
      continue;
    }
    // Section in both: keep manual lines, append auto-gen lines whose refs are
    // NOT already covered by a manual entry.
    const kept = [];
    for (const line of lines) {
      const isBullet = line.trim().startsWith("-");
      if (!isBullet) continue; // skip blank/non-bullet lines
      const refs = extractRefs(line);
      const covered = refs.size > 0 && [...refs].every((r) => manualRefs.has(r));
      if (!covered) kept.push(line);
    }
    if (kept.length > 0) {
      merged.get(section).push("", ...kept);
    }
  }

  // Emit in canonical order; unknown sections appended in encounter order.
  const ordered = [];
  const seen = new Set();
  for (const header of SECTION_ORDER) {
    if (merged.has(header)) {
      ordered.push(header, "", ...merged.get(header));
      seen.add(header);
    }
  }
  for (const [header, lines] of merged) {
    if (!seen.has(header)) {
      ordered.push(header, "", ...lines);
      seen.add(header);
    }
  }

  // Collapse 3+ consecutive blank lines (from section joins) to 2.
  const body = ordered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return body || null;
}

/**
 * Extract the changelog body for a given version from CHANGELOG.md.
 * Returns the content between ## [version] and the next ## [ header.
 *
 * @param {string} version - e.g. "3.6.0"
 * @param {string} [changelogPath] - optional override (defaults to ROOT/CHANGELOG.md);
 *   accepted so the function is unit-testable with a temp fixture.
 */
export function extractChangelogSection(version, changelogPath = join(ROOT, "CHANGELOG.md")) {
  if (!existsSync(changelogPath)) return null;

  const content = readFileSync(changelogPath, "utf-8");
  const header = `## [${version}]`;
  const start = content.indexOf(header);
  if (start === -1) return null;

  // Find end of first line (the header line)
  const bodyStart = content.indexOf("\n", start) + 1;

  // Find next ## [ header
  const nextHeader = content.indexOf("\n## [", bodyStart);
  const body = nextHeader === -1
    ? content.slice(bodyStart)
    : content.slice(bodyStart, nextHeader);

  return body.trim() || null;
}

/**
 * Build the summary line for the GitHub Release outcome.
 *
 * Pre-fix behavior printed "GitHub Release: ✅" unconditionally whenever --tag
 * was passed, even when the try/catch above had caught a failure. That made the
 * summary lie about a failed release. This pure function is extracted so the
 * regression is unit-testable.
 *
 * @param {{ doTag: boolean, releaseCreated: boolean }} state
 * @returns {string} the line to print (empty string when --tag not requested)
 */
export function formatReleaseSummary({ doTag, releaseCreated }) {
  if (!doTag) return "";
  return releaseCreated ? "  GitHub Release: ✅" : "  GitHub Release: ❌ (见上方错误，可手动创建)";
}

/**
 * Preflight checks before bumping version.
 * Collects all failures and reports them at once.
 */
function preflightChecks(newVersion, doTag) {
  const errors = [];

  // 1. Working tree must be clean
  try {
    const dirty = execSync("git status --porcelain", { encoding: "utf-8", cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (dirty) {
      const fileCount = dirty.split("\n").length;
      errors.push(`工作树不干净 (${fileCount} 个文件) — 请先 stash 或 commit`);
    }
  } catch {
    errors.push("无法检查工作树状态");
  }

  // 2. Tag must not already exist
  try {
    const tagName = `v${newVersion}`;
    execSync(`git rev-parse "${tagName}" --verify`, { encoding: "utf-8", cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    errors.push(`tag ${tagName} 已存在 — 使用 git tag -d ${tagName} 删除后重试`);
  } catch {
    // tag doesn't exist — good
  }

  // 3. No tracked build artifacts in dist/
  const trackedPaths = ["dist/src/", "dist/scripts/", "dist/locales/"];
  try {
    const tracked = execSync(`git ls-files ${trackedPaths.join(" ")}`, { encoding: "utf-8", cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (tracked) {
      const fileCount = tracked.split("\n").filter(Boolean).length;
      errors.push(
        `${trackedPaths.join(", ")} 下有 ${fileCount} 个文件被 git 跟踪 — 请先 git rm --cached 并更新 .gitignore`,
      );
    }
  } catch {
    // git ls-files failed — skip check
  }

  // 4. TypeScript must compile (only when --tag)
  if (doTag) {
    try {
      console.log("  ⏳ 正在验证 TypeScript 编译...");
      execSync("npx tsc --noEmit", { encoding: "utf-8", cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });
    } catch (e) {
      const output = (e.stdout || "") + (e.stderr || "");
      const lines = output.split("\n").filter((l) => l.startsWith("error TS"));
      const detail = lines.length > 0 ? ` (${lines[0]})` : "";
      errors.push(`TypeScript 编译失败${detail} — 请先修复 tsc 错误`);
    }
  }

  if (errors.length > 0) {
    console.error("\n❌ 预检失败:");
    for (const err of errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  }

  console.log("\n✅ 预检通过");
}

function main() {
  const args = process.argv.slice(2);

  // Tracked across the release step so the final summary reports the real
  // outcome instead of an unconditional ✅ (see formatReleaseSummary).
  let releaseCreated = false;

  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node scripts/bump-version.mjs <version | patch | minor | major> [--commit] [--tag]");
    console.log("");
    console.log("Bump version across package.json / plugin.json, rebuild dist, optionally commit + tag + GitHub Release.");
    console.log("");
    console.log("Examples:");
    console.log("  node scripts/bump-version.mjs minor                    # update version files + rebuild dist");
    console.log("  node scripts/bump-version.mjs minor --commit           # + git commit");
    console.log("  node scripts/bump-version.mjs minor --commit --tag     # + commit + tag + push + GitHub Release");
    console.log("  node scripts/bump-version.mjs 3.2.0 --commit --tag     # pin exact version, one-shot release");
    process.exit(0);
  }

  const flags = args.filter((a) => a.startsWith("--"));
  const positional = args.filter((a) => !a.startsWith("--"));

  const doCommit = flags.includes("--commit");
  const doTag = flags.includes("--tag");
  const input = positional[0];

  if (!input) {
    console.error("用法: node scripts/bump-version.mjs <version | patch | minor | major> [--commit] [--tag]");
    console.error("");
    console.error("示例:");
    console.error("  node scripts/bump-version.mjs minor                    # 更新 + 重建 dist");
    console.error("  node scripts/bump-version.mjs minor --commit           # + git commit");
    console.error("  node scripts/bump-version.mjs minor --commit --tag     # + commit + tag + push + release");
    console.error("  node scripts/bump-version.mjs 3.2.0 --commit --tag     # 指定版本，一键发版");
    process.exit(1);
  }

  if (doTag && !doCommit) {
    console.error("⚠️ --tag 需要 --commit（tag 基于 commit 创建）");
    process.exit(1);
  }

  const currentVersion = readJSON(join(ROOT, "package.json")).version;
  const newVersion = resolveNewVersion(currentVersion, input);

  if (!newVersion) {
    console.error(`无效参数: ${input}`);
    console.error("支持: 具体版本号 (x.y.z) 或 patch / minor / major");
    process.exit(1);
  }

  // Preflight checks
  preflightChecks(newVersion, doTag);

  // Step 1: Update version files
  let updated = 0;

  for (const relPath of VERSION_FILES) {
    const absPath = join(ROOT, relPath);

    if (!existsSync(absPath)) {
      console.log(`  ⊘ ${relPath} — 不存在，跳过`);
      continue;
    }

    const data = readJSON(absPath);

    if (data.version === newVersion) {
      console.log(`  ✓ ${relPath} — 已是 ${newVersion}`);
      continue;
    }

    const oldVersion = data.version;
    data.version = newVersion;
    writeJSON(absPath, data);
    console.log(`  ↑ ${relPath} — ${oldVersion} → ${newVersion}`);
    updated++;
  }

  if (updated === 0) {
    console.log("\n所有文件已是目标版本，无需更新");
    return;
  }

  console.log(`\n已更新 ${updated} 个文件到 ${newVersion}`);

  // Step 2: Rebuild dist
  const buildScript = join(ROOT, "scripts", "build-dist.sh");
  if (existsSync(buildScript)) {
    console.log("\n正在重建 dist 包...");
    try {
      execFileSync("bash", [buildScript], {
        cwd: ROOT,
        stdio: "inherit",
        timeout: 120_000,
      });
      console.log("\n✅ dist 包已重建");
    } catch {
      console.error("\n⚠️ dist 重建失败，请手动运行: bash scripts/build-dist.sh");
      process.exit(1);
    }
  }

  // Step 2b: Update CHANGELOG.md — auto-generate from commits (if --commit)
  if (doCommit) {
    const changelogPath = join(ROOT, "CHANGELOG.md");
    if (existsSync(changelogPath)) {
      const content = readFileSync(changelogPath, "utf-8");
      const unreleasedHeader = "## [Unreleased]";

      if (!content.includes(unreleasedHeader)) {
        console.log("  ⊘ CHANGELOG.md — 未找到 ## [Unreleased]，跳过");
      } else {
        // Extract any manual entries under [Unreleased]
        const afterHeader = content.indexOf(unreleasedHeader) + unreleasedHeader.length;
        const nextSection = content.indexOf("\n## [", afterHeader);
        const manualEntries = content.slice(afterHeader, nextSection).trim();

        // Auto-generate from conventional commits since last tag
        const lastTag = `v${currentVersion}`;
        const autoEntries = generateChangelogFromCommits(lastTag);

        // Merge auto-gen + manual entries: collapse duplicate sections and drop
        // terse auto-gen lines whose PR ref is already covered by a detailed
        // manual entry (so a hand-written ⚠️ migration note never gets buried
        // by a one-line summary of the same PR). See mergeChangelogEntries().
        const changelogBody = mergeChangelogEntries(autoEntries, manualEntries);
        if (!changelogBody) {
          console.log("\n  ⚠️ CHANGELOG.md [Unreleased] 为空且无新提交 — 跳过 changelog 更新");
        }

        if (changelogBody) {
          const today = new Date().toISOString().slice(0, 10);
          const updated = content.replace(
            unreleasedHeader,
            `${unreleasedHeader}\n\n## [${newVersion}] - ${today}\n\n${changelogBody}`,
          );
          writeFileSync(changelogPath, updated);
          console.log(`  ↑ CHANGELOG.md — 自动生成 [${newVersion}] 条目 (${changelogBody.split('\n').length} 行)`);
        }
      }
    }
  }

  // Step 3: Git commit (if --commit)
  if (doCommit) {
    console.log("\n正在提交...");
    try {
      // NOTE: dist-plugin/ is gitignored (rebuilt on demand by build-dist.sh);
      // dist/claude-code/bundles/ likewise never tracked. Including either in the
      // add list makes git add exit non-zero and the commit silently never runs.
      // dist-plugin/.claude-plugin/plugin.json version is synced by build-dist.sh
      // on the next build (it reads package.json as the source of truth).
      gitExec("add package.json .claude-plugin/plugin.json CHANGELOG.md");
      gitExec(`commit -m "chore: bump version to ${newVersion}\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`);
      const sha = gitExec("rev-parse --short HEAD");
      console.log(`  ✓ committed as ${sha}`);
    } catch (e) {
      console.error(`  ⚠️ commit 失败: ${e.message}`);
      process.exit(1);
    }
  }

  // Step 4: Git tag (if --tag)
  if (doTag) {
    const tagName = `v${newVersion}`;
    console.log(`\n正在创建 tag ${tagName}...`);
    try {
      gitExec(`tag -a ${tagName} -m "${tagName}"`);
      console.log(`  ✓ tag ${tagName} 已创建`);
    } catch (e) {
      console.error(`  ⚠️ tag 创建失败: ${e.message}`);
      process.exit(1);
    }
  }

  // Step 5: Push commit + tag (if --tag)
  if (doTag) {
    const tagName = `v${newVersion}`;
    console.log("\n正在推送到 remote...");
    try {
      gitExec("push");
      gitExec(`push origin ${tagName}`);
      console.log(`  ✓ commit + tag ${tagName} 已推送`);
    } catch (e) {
      console.error(`  ⚠️ push 失败: ${e.message}`);
      process.exit(1);
    }

    // Step 6: Create GitHub Release (if gh available)
    console.log(`\n正在创建 GitHub Release ${tagName}...`);
    try {
      const repoUrl = gitExec("remote get-url origin");
      const compareUrl = repoUrl
        .replace(/\.git$/, "")
        .replace(/^git@github\.com:/, "https://github.com/");

      // Extract changelog section for this version
      const changelogBody = extractChangelogSection(newVersion);
      const footer = `\n\n---\n\n**Full Changelog**: ${compareUrl}/compare/v${currentVersion}...${tagName}`;
      const releaseNotes = changangelogBody
        ? changelogBody + footer
        : `See [CHANGELOG](${compareUrl}/compare/v${currentVersion}...${tagName}) for details.`;

      // Write notes to temp file to avoid shell escaping issues
      const notesFile = join(ROOT, ".tmp-release-notes.md");
      writeFileSync(notesFile, releaseNotes);

      execSync(
        `gh release create ${tagName} --title "${tagName}" --notes-file "${notesFile}"`,
        { encoding: "utf-8", cwd: ROOT, stdio: "inherit" },
      );

      // Cleanup temp file
      try { unlinkSync(notesFile); } catch {}

      console.log(`  ✓ GitHub Release ${tagName} 已创建`);
      releaseCreated = true;
    } catch (e) {
      // Include error type + stack; bare e.message hid the root cause on a
      // prior release ("changelogBody is not defined" with no stack).
      const errType = e?.constructor?.name ?? "Error";
      console.error(`  ⚠️ GitHub Release 创建失败 [${errType}]: ${e?.message ?? e}`);
      if (e?.stack) console.error(`    ${e.stack.split("\n").slice(1, 4).join("\n    ")}`);
      console.error(`  可手动创建: gh release create ${tagName} --title "${tagName}"`);
      // 不 exit — release 失败不阻断，tag 已推送
    }
  }

  // Summary
  console.log(`\n=== 完成 ===`);
  console.log(`  版本: ${currentVersion} → ${newVersion}`);
  if (doCommit) console.log("  commit: ✅");
  if (doTag) console.log(`  tag: v${newVersion} ✅`);
  if (doTag) console.log(formatReleaseSummary({ doTag, releaseCreated }));
  if (!doCommit) console.log("  提示: 加 --commit 自动提交，加 --tag 创建 tag + push + release");
}

// Only run main() when executed directly (e.g. `node scripts/bump-version.mjs`),
// not when imported as a module for unit testing. This is the standard CLI
// guard and lets the helper functions be tested without import-time side effects.
// Resolve argv[1] to an absolute path first so it works regardless of whether
// the process was launched with a relative or absolute script path.
const invokedAsEntry = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedAsEntry) {
  main();
}
