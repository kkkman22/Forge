#!/usr/bin/env node
// category: internal-only
// Forge bootstrap check — SessionStart hook
// Detects plugin activated but project not initialized state, outputs non-blocking guidance.
// Also checks Claude Code version compatibility (Req 1.3, 1.4, 1.7).
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";

const DOCTOR_DISMISS_FILE = ".forge/.bootstrap-doctor-dismissed";

// ---------------------------------------------------------------------------
// Version diagnostic — pure function, exported for testing
// ---------------------------------------------------------------------------

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)/;

/**
 * Build a version diagnostic string if the current version is problematic.
 * Returns null/empty if no diagnostic needed (pass or fail-open).
 *
 * @param {string} currentOutput - Raw output from `claude --version`
 * @param {string} minimum - Minimum required version (X.Y.Z)
 * @param {string} [maximum] - Optional maximum verified version
 * @returns {string|null} Diagnostic text, or null if OK
 */
export function buildVersionDiagnostic(currentOutput, minimum, maximum) {
  // Parse current version
  const match = currentOutput.match(SEMVER_RE);
  if (!match) return null; // Fail-open: can't parse → no diagnostic

  const current = `${match[1]}.${match[2]}.${match[3]}`;
  const cmp = compareVersion(current, minimum);

  if (cmp < 0) {
    // Below minimum → hard diagnostic
    return `⚠️ Claude Code ${current} is below Forge minimum ${minimum}. Some features (Stop additionalContext, session id consistency) require >= ${minimum}. Update Claude Code or run forge-doctor for diagnostics.`;
  }

  if (maximum && compareVersion(current, maximum) > 0) {
    // Above verified maximum → soft warn
    return `ℹ️ Claude Code ${current} is above the verified maximum ${maximum}. Forge may work correctly. Run forge-doctor to check compatibility.`;
  }

  return null; // Pass
}

function compareVersion(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Decide whether to run cmux config doctor (R4.1).
 * @param {{ cwd: string }} env
 * @param {(path: string) => boolean} fsExists
 */
export function shouldRunCmuxDoctor(env, fsExists) {
  if (!fsExists(`${env.cwd}/cmux.json`)) return { run: false, reason: "no_cmux_json" };
  if (fsExists(`${env.cwd}/${DOCTOR_DISMISS_FILE}`)) return { run: false, reason: "user_dismissed" };
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
	   运行 \`/tinkerman init\` 创建 .forge/ 目录、配置项目宪法与 7 个 Subagent。
	   若不打算在本项目使用 Forge，可创建空文件 \`.forge/.bootstrap-dismissed\` 跳过此提示。`;

function runDoctor(cwd) {
  return new Promise((resolve) => {
    execFile(
      "cmux",
      ["config", "doctor", "--path", `${cwd}/cmux.json`],
      { timeout: 1500 },
      (err, _stdout, stderr) => {
        if (!err) return resolve({ ok: true });
        if (err.code === "ENOENT") return resolve({ ok: true, silent: true });
        if (err.killed) return resolve({ ok: true, silent: true });
        const lines = (stderr || "").split("\n").slice(0, 4).filter(Boolean);
        return resolve({ ok: false, lines });
      },
    );
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

      // Version compatibility check (Req 1.3, 1.4, 1.7)
      try {
        const versionResult = await new Promise((resolve) => {
          execFile("claude", ["--version"], { timeout: 3000 }, (err, stdout) => {
            resolve(err ? null : String(stdout).trim());
          });
        });
        if (versionResult) {
          const diagnostic = buildVersionDiagnostic(versionResult, "2.1.163");
          if (diagnostic) {
            process.stdout.write(`${diagnostic}\n`);
          }
        }
      } catch {
        // Fail-open: version check failure must not break bootstrap
      }
    }

    process.exit(0);
  } catch {
    process.exit(0);
  }
}

// Run main when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
