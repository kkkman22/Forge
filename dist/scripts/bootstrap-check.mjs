#!/usr/bin/env node
// category: internal-only
// Forge bootstrap check — SessionStart hook
// Detects plugin activated but project not initialized state, outputs non-blocking guidance.
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
const DOCTOR_DISMISS_FILE = ".forge/.bootstrap-doctor-dismissed";
/**
 * Decide whether to run cmux config doctor (R4.1).
 * @param {{ cwd: string }} env
 * @param {(path: string) => boolean} fsExists
 */
export function shouldRunCmuxDoctor(env, fsExists) {
    if (!fsExists(`${env.cwd}/cmux.json`))
        return { run: false, reason: "no_cmux_json" };
    if (fsExists(`${env.cwd}/${DOCTOR_DISMISS_FILE}`))
        return { run: false, reason: "user_dismissed" };
    return { run: true };
}
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
function runDoctor(cwd) {
    return new Promise((resolve) => {
        execFile("cmux", ["config", "doctor", "--path", `${cwd}/cmux.json`], { timeout: 1500 }, (err, _stdout, stderr) => {
            if (!err)
                return resolve({ ok: true });
            if (err.code === "ENOENT")
                return resolve({ ok: true, silent: true });
            if (err.killed)
                return resolve({ ok: true, silent: true });
            const lines = (stderr || "").split("\n").slice(0, 4).filter(Boolean);
            return resolve({ ok: false, lines });
        });
    });
}
async function main() {
    try {
        const env = { pluginRoot: process.env.CLAUDE_PLUGIN_ROOT, cwd: process.cwd() };
        const decision = shouldShowBootstrap(env, existsSync);
        if (decision.kind === "show") {
            process.stdout.write(BOOTSTRAP_TEXT + "\n");
            process.exit(0);
        }
        // R4.1: Only on already_initialized path
        if (decision.kind === "skip" && decision.reason === "already_initialized") {
            const doctorDecision = shouldRunCmuxDoctor(env, existsSync);
            if (doctorDecision.run) {
                const result = await runDoctor(env.cwd);
                if (!result.ok && result.lines && result.lines.length > 0) {
                    for (const line of result.lines) {
                        process.stdout.write(`⚠️ cmux.json: ${line}\n`);
                    }
                }
            }
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