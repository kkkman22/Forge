/**
 * agent-links.ts — Agent symlink 完整性校验核心逻辑(纯函数,可测)。
 *
 * ADR-0010: `.claude/agents/` 全部为 symlink 指向 `agents/` 唯一源。
 * 本模块提供校验逻辑,确认每个 `.claude/agents/*.md` 都是有效 symlink,
 * 指向 `../../agents/<name>.md` 且目标存在。CLI 入口在 scripts/check-agent-links.mjs。
 *
 * @see scripts/check-agent-links.mjs
 */

import { lstatSync, readlinkSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

/** 期望的 symlink 目标相对路径前缀(.claude/agents/<x>.md → ../../agents/<x>.md)。 */
export const EXPECTED_TARGET_PREFIX = "../../agents/";

/** 校验发现的问题。 */
export interface AgentLinkIssue {
  /** 问题文件名(相对 .claude/agents/,如 forge-build.md)。 */
  file: string;
  /** 问题代码。 */
  code: "NOT_SYMLINK" | "BROKEN_TARGET" | "WRONG_TARGET";
  /** 人类可读说明。 */
  message: string;
}

/** 虚拟文件,用于测试注入假文件而不污染真实目录。 */
interface VirtualFs {
  /** 虚拟的普通文件(非 symlink),模拟"应为 symlink 却是实体"的情况。 */
  virtualFiles?: string[];
  /** 虚拟 symlink:file → target(目标不存在则触发 BROKEN_TARGET)。 */
  virtualSymlinks?: Record<string, string>;
}

/**
 * 列出 `.claude/agents/` 下的 agent 文件(排除 README.md)。
 * @param claudeAgentsDir .claude/agents/ 的绝对或相对路径
 */
export function listClaudeAgents(claudeAgentsDir: string): string[] {
  if (!existsSync(claudeAgentsDir)) return [];
  return readdirSync(claudeAgentsDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();
}

/**
 * 判断路径是否是 symlink。
 */
export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * 读取 symlink 的目标路径(原始字符串,不解析)。
 * 非 symlink 返回 null。
 */
export function resolveSymlinkTarget(path: string): string | null {
  try {
    if (!lstatSync(path).isSymbolicLink()) return null;
    return readlinkSync(path);
  } catch {
    return null;
  }
}

/**
 * 校验 `.claude/agents/` 下所有 agent 文件是否都是有效 symlink。
 *
 * 校验项:
 * 1. 每个文件必须是 symlink(NOT_SYMLINK)
 * 2. 目标必须是 ../../agents/<同名>.md(WRONG_TARGET)
 * 3. 目标文件必须存在(BROKEN_TARGET)
 *
 * @param claudeAgentsDir .claude/agents/ 路径
 * @param agentsDir agents/ 路径(用于校验目标存在性)
 * @param vfs 测试用虚拟文件注入
 * @returns 问题列表(空数组=全部通过)
 */
export function validateAgentLinks(
  claudeAgentsDir: string,
  agentsDir: string,
  vfs: VirtualFs = {}
): AgentLinkIssue[] {
  const issues: AgentLinkIssue[] = [];

  // 收集所有待校验文件:真实文件 + 虚拟文件 + 虚拟 symlink key
  const realFiles = listClaudeAgents(claudeAgentsDir);
  const virtualSymlinkFiles = vfs.virtualSymlinks ? Object.keys(vfs.virtualSymlinks) : [];
  const allFiles = [...new Set([...realFiles, ...(vfs.virtualFiles ?? []), ...virtualSymlinkFiles])];

  for (const file of allFiles) {
    const fullPath = join(claudeAgentsDir, file);
    const expectedTarget = `${EXPECTED_TARGET_PREFIX}${file}`;

    // 虚拟 symlink 优先(测试注入)
    if (vfs.virtualSymlinks?.[file]) {
      const target = vfs.virtualSymlinks[file];
      // 校验目标路径正确性
      if (target !== expectedTarget) {
        issues.push({
          file,
          code: "WRONG_TARGET",
          message: `symlink 目标错误: 期望 ${expectedTarget}, 实际 ${target}`,
        });
        continue;
      }
      // 校验目标存在性(虚拟 symlink 目标用真实 agents/ 校验)
      const resolvedTarget = resolve(dirname(fullPath), target);
      if (!existsSync(resolvedTarget)) {
        issues.push({
          file,
          code: "BROKEN_TARGET",
          message: `symlink 目标不存在: ${target}`,
        });
      }
      continue;
    }

    // 虚拟普通文件(测试注入:应为 symlink 却是实体)
    if (vfs.virtualFiles?.includes(file) && !realFiles.includes(file)) {
      issues.push({
        file,
        code: "NOT_SYMLINK",
        message: `应为 symlink,实际是普通文件: ${file}`,
      });
      continue;
    }

    // 真实文件校验
    if (!isSymlink(fullPath)) {
      issues.push({
        file,
        code: "NOT_SYMLINK",
        message: `应为 symlink,实际是普通文件: ${file}`,
      });
      continue;
    }

    const target = resolveSymlinkTarget(fullPath);
    if (target !== expectedTarget) {
      issues.push({
        file,
        code: "WRONG_TARGET",
        message: `symlink 目标错误: 期望 ${expectedTarget}, 实际 ${target}`,
      });
      continue;
    }

    // 校验目标存在
    const resolvedTarget = resolve(dirname(fullPath), target);
    if (!existsSync(resolvedTarget)) {
      issues.push({
        file,
        code: "BROKEN_TARGET",
        message: `symlink 目标不存在: ${target}`,
      });
    }
  }

  return issues;
}
