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
//   1. 更新版本文件 + rebuild dist
//   2. git commit
//   3. git tag (annotated)
//   4. git push + push tag
//   5. gh release create (需要 gh CLI 已登录)
//
// 更新文件:
//   - package.json
//   - .claude-plugin/plugin.json
//   - dist-plugin/.claude-plugin/plugin.json (如存在)
//   - dist/ dist-plugin/ (自动 rebuild)
//   - CHANGELOG.md (自动将 [Unreleased] 升级为版本条目)
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const VERSION_FILES = [
  "package.json",
  ".claude-plugin/plugin.json",
  "dist-plugin/.claude-plugin/plugin.json",
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

function main() {
  const args = process.argv.slice(2);
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

  // Step 2b: Update CHANGELOG.md (if --commit)
  if (doCommit) {
    const changelogPath = join(ROOT, "CHANGELOG.md");
    if (existsSync(changelogPath)) {
      const content = readFileSync(changelogPath, "utf-8");
      const unreleasedHeader = "## [Unreleased]";

      if (content.includes(unreleasedHeader)) {
        // Check if there's actual content under [Unreleased] (any ### section)
        const unreleasedBlock = content.slice(
          content.indexOf(unreleasedHeader) + unreleasedHeader.length,
          content.indexOf("\n## [", content.indexOf(unreleasedHeader) + unreleasedHeader.length),
        );
        const hasContent = unreleasedBlock.trim().length > 0;

        if (!hasContent) {
          console.log("\n  ⚠️ CHANGELOG.md [Unreleased] 为空 — 请先补充变更条目");
          console.log("  提示: 在 ## [Unreleased] 下添加 ### Added / ### Fixed / ... 章节");
          process.exit(1);
        }

        const today = new Date().toISOString().slice(0, 10);
        const updated = content.replace(
          unreleasedHeader,
          `${unreleasedHeader}\n\n## [${newVersion}] - ${today}`,
        );
        writeFileSync(changelogPath, updated);
        console.log(`  ↑ CHANGELOG.md — [Unreleased] → [${newVersion}] - ${today}`);
      } else {
        console.log("  ⊘ CHANGELOG.md — 未找到 ## [Unreleased]，跳过");
      }
    }
  }

  // Step 3: Git commit (if --commit)
  if (doCommit) {
    console.log("\n正在提交...");
    try {
      gitExec("add package.json .claude-plugin/plugin.json dist/ dist-plugin/ CHANGELOG.md");
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
      execSync(
        `gh release create ${tagName} --title "${tagName}" --notes "See [CHANGELOG](${compareUrl}/compare/v${currentVersion}...${tagName}) for details."`,
        { encoding: "utf-8", cwd: ROOT, stdio: "inherit" },
      );
      console.log(`  ✓ GitHub Release ${tagName} 已创建`);
    } catch (e) {
      console.error(`  ⚠️ GitHub Release 创建失败: ${e.message}`);
      console.error(`  可手动创建: gh release create ${tagName} --title "${tagName}"`);
      // 不 exit — release 失败不阻断，tag 已推送
    }
  }

  // Summary
  console.log(`\n=== 完成 ===`);
  console.log(`  版本: ${currentVersion} → ${newVersion}`);
  if (doCommit) console.log("  commit: ✅");
  if (doTag) console.log(`  tag: v${newVersion} ✅`);
  if (doTag) console.log("  GitHub Release: ✅");
  if (!doCommit) console.log("  提示: 加 --commit 自动提交，加 --tag 创建 tag + push + release");
}

main();
