#!/usr/bin/env node
// category: internal-only
// Forge bootstrap check — SessionStart hook
// Detects plugin activated but project not initialized state, outputs non-blocking guidance.
import { existsSync } from "node:fs";
/**
 * @param {{ pluginRoot: string|undefined, cwd: string }} env
 * @param {(path: string) => boolean} fsExists
 * @returns {{ kind: "show" } | { kind: "skip", reason: "already_initialized"|"user_dismissed"|"no_plugin_context" }}
 */
export function shouldShowBootstrap(env, fsExists) {
    if (fsExists(`${env.cwd}/.forge/config.md`)) {
        return { kind: "skip", reason: "already_initialized" };
    }
    if (fsExists(`${env.cwd}/.forge/.bootstrap-dismissed`)) {
        return { kind: "skip", reason: "user_dismissed" };
    }
    if (!env.pluginRoot || env.pluginRoot.length === 0) {
        return { kind: "skip", reason: "no_plugin_context" };
    }
    return { kind: "show" };
}
const BOOTSTRAP_TEXT = `💡 Forge plugin 已激活，但当前项目尚未初始化。
   运行 \`/forge init\` 创建 .forge/ 目录、配置项目宪法与 7 个 Subagent。
   若不打算在本项目使用 Forge，可创建空文件 \`.forge/.bootstrap-dismissed\` 跳过此提示。`;
function main() {
    try {
        const decision = shouldShowBootstrap({ pluginRoot: process.env.CLAUDE_PLUGIN_ROOT, cwd: process.cwd() }, existsSync);
        if (decision.kind === "show") {
            process.stdout.write(BOOTSTRAP_TEXT + "\n");
        }
        process.exit(0);
    }
    catch {
        process.exit(0);
    }
}
// Run main when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
//# sourceMappingURL=bootstrap-check.mjs.map