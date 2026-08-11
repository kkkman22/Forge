#!/usr/bin/env node
// category: user-facing
/**
 * migrate-forge-to-tinkerman.mjs — ADR-0010 批次3 状态目录迁移工具。
 *
 * 递归复制 `.tinkerman/` → `.tinkerman/`，校验文件数 + 每文件 SHA256 一致。
 * 失败不删原 `.tinkerman/`（保组织记忆连续性，ADR-0009 保留 #4）。
 *
 * Usage:
 *   node scripts/migrate-forge-to-tinkerman.mjs --dry-run   # 预演（不写）
 *   node scripts/migrate-forge-to-tinkerman.mjs             # 实跑（复制 + 校验）
 *   node scripts/migrate-forge-to-tinkerman.mjs --help
 *
 * Exit codes:
 *   0 = 成功（dry-run 校验通过，或实跑复制 + 校验一致）
 *   1 = 校验失败（文件数或哈希不一致，原 .tinkerman/ 未动）
 *   2 = 参数错误
 *
 * 注意：本脚本只迁移状态目录。代码内 160 处 `.tinkerman/` 引用的改写 +
 * fallback 读取期是批次3 的另一部分（见 route-degradation-and-cleanup / rename spec）。
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log(`migrate-forge-to-tinkerman — ADR-0010 批次3 状态目录迁移

Usage:
  migrate-forge-to-tinkerman [--dry-run] [--help]

Options:
  --dry-run   预演：计算 + 校验，但不写 .tinkerman/
  --help      显示此帮助

将 .tinkerman/ 递归复制到 .tinkerman/，逐文件 SHA256 校验。
失败（文件数/哈希不一致）时原 .tinkerman/ 保持不变。`);
  process.exit(0);
}
const DRY = args.has("--dry-run");
const unknown = [...args].filter((a) => !["--dry-run", "--help"].includes(a));
if (unknown.length) {
  console.error(`未知参数: ${unknown.join(", ")}（用 --help 查看选项）`);
  process.exit(2);
}

const SRC = resolve(process.cwd(), ".tinkerman");
const DST = resolve(process.cwd(), ".tinkerman");

if (!existsSync(SRC) || !statSync(SRC).isDirectory()) {
  console.error(`源目录不存在: ${SRC}（无需迁移，exit 0）`);
  process.exit(0);
}

/** 计算文件 SHA256（流式，避免大文件爆内存）。 */
function sha256(path) {
  return new Promise((resolvePromise, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(path);
    s.on("data", (chunk) => h.update(chunk));
    s.on("end", () => resolvePromise(h.digest("hex")));
    s.on("error", reject);
  });
}

/** 递归收集目录下所有文件（相对路径）。 */
function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(full.slice(base.length + 1));
  }
  return out;
}

const files = walk(SRC);
console.log(`${DRY ? "[dry-run] " : ""}源 .tinkerman/ 含 ${files.length} 文件`);

// 收集源哈希
const srcHashes = new Map();
for (const rel of files) {
  srcHashes.set(rel, await sha256(join(SRC, rel)));
}

if (DRY) {
  console.log(`[dry-run] 将复制到 ${DST}/，${files.length} 文件，逐文件 SHA256 校验。`);
  console.log("[dry-run] 预演通过，未写任何文件。实跑去掉 --dry-run。");
  process.exit(0);
}

// 实跑：复制到 .tinkerman/
if (existsSync(DST)) {
  console.error(`目标已存在: ${DST}（删除后重试，或手动确认）`);
  process.exit(1);
}
mkdirSync(DST, { recursive: true });

let copied = 0;
let mismatch = 0;
const mismatches = [];
for (const rel of files) {
  const srcPath = join(SRC, rel);
  const dstPath = join(DST, rel);
  mkdirSync(resolve(dstPath, ".."), { recursive: true });
  copyFileSync(srcPath, dstPath);
  copied++;
  // 复制后校验哈希
  const dstHash = await sha256(dstPath);
  if (dstHash !== srcHashes.get(rel)) {
    mismatch++;
    mismatches.push(rel);
  }
}

console.log(`复制 ${copied} 文件到 .tinkerman/`);

if (mismatch > 0) {
  console.error(`校验失败: ${mismatch} 文件哈希不一致:`);
  mismatches.slice(0, 10).forEach((r) => console.error(`  ${r}`));
  console.error("原 .tinkerman/ 未动。删除 .tinkerman/ 后重试。");
  // 清理失败的目标（保留原 .tinkerman/）
  rmSync(DST, { recursive: true, force: true });
  console.error("已清理 .tinkerman/（原 .tinkerman/ 完整保留）。");
  process.exit(1);
}

console.log(`✅ 校验通过: ${copied} 文件，SHA256 全部一致。`);
console.log(`.tinkerman/ 与 .tinkerman/ 并存。确认无误后手动删除 .tinkerman/（或在兼容期结束后）。`);
process.exit(0);
