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

function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeJSON(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function main() {
  const newVersion = process.argv[2];

  if (!newVersion || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
    console.error("用法: node scripts/bump-version.mjs <version>");
    console.error("示例: node scripts/bump-version.mjs 3.2.0");
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
