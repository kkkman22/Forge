#!/usr/bin/env node
// category: user-facing
// ============================================================================
// bump-version — 同步更新所有版本文件
//
// 用法:
//   node scripts/bump-version.mjs <new-version>
//   node scripts/bump-version.mjs 3.2.0
//
// 更新文件:
//   - package.json
//   - .claude-plugin/plugin.json
//   - dist-plugin/.claude-plugin/plugin.json (如存在)
//
// 验证: 更新后运行 plugin-manifest contract test 确保一致
// ============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
  // Direct version number: 3.2.0
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(input)) {
    return input;
  }

  // Bump level: patch / minor / major
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

function main() {
  const input = process.argv[2];

  if (!input) {
    console.error("用法: node scripts/bump-version.mjs <version | patch | minor | major>");
    console.error("示例:");
    console.error("  node scripts/bump-version.mjs 3.2.0    # 指定版本号");
    console.error("  node scripts/bump-version.mjs patch     # 3.1.0 → 3.1.1");
    console.error("  node scripts/bump-version.mjs minor     # 3.1.0 → 3.2.0");
    console.error("  node scripts/bump-version.mjs major     # 3.1.0 → 4.0.0");
    process.exit(1);
  }

  const currentVersion = readJSON(join(ROOT, "package.json")).version;
  const newVersion = resolveNewVersion(currentVersion, input);

  if (!newVersion) {
    console.error(`无效参数: ${input}`);
    console.error("支持: 具体版本号 (x.y.z) 或 patch / minor / major");
    process.exit(1);
  }

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

  if (updated > 0) {
    console.log(`\n已更新 ${updated} 个文件到 ${newVersion}`);
    console.log("验证: npx vitest run test/plugin-manifest.test.ts");
  } else {
    console.log("\n所有文件已是目标版本，无需更新");
  }
}

main();
