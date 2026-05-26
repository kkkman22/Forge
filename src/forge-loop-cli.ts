#!/usr/bin/env node

/**
 * CLI entry point — Commander-based program that parses arguments, validates
 * preconditions, sets up the run, and starts the autonomous loop driver.
 *
 * Responsibilities:
 * - Parse positional `objective` and named options
 * - Validate git repo state (clean working tree, valid branch for worktree)
 * - Pre-warm the Agent SDK via `startup()`
 * - Spawn sleep prevention process if enabled
 * - Wire signal handlers for graceful shutdown
 * - Start the driver loop and handle cleanup on exit
 *
 * Design reference: sdk-autonomous-loop § forge-loop-cli.ts
 * **Validates: Requirements 1.4, 1.6, 6.1–6.10, 4.5, 4.6, 4.7**
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { CliError } from "./cli-error.js";
import { CliSubprocessDriver } from "./cli-subprocess-driver.js";
import { extractConfigLang, mergeLogConfig, parseLogConfig } from "./config-store.js";
import { formatNotesDocument } from "./context-accumulator.js";
import { EffectExecutor } from "./effect-executor.js";
import { classifyExitCode } from "./error-handler.js";
import { ensureGlossaryExists, type GlossaryFs } from "./glossary-driver.js";
import { type I18nConfig, parseTranslationFile, translate } from "./i18n.js";
import { IpcEmitter } from "./ipc-emitter.js";
import { detectLocale } from "./locale-detector.js";
import {
  createDualSink,
  createFileWriter,
  createLogEntry,
  createLogSink,
  type LogSinkConfig,
  validateFileWritable,
} from "./logger/index.js";
import type { LoopConfig, RunLimits } from "./loop-types.js";
import {
  cleanupOrphans,
  cleanupStaleSessions,
  countActiveSessions,
  deletePidFile,
  detectPpidOrphans,
  type PidFileContent,
  writePidFile,
} from "./orphan-detector.js";
import { ProcessRegistry } from "./process-registry.js";
import type { TaskType } from "./pua-engine.js";
import { branchExists, RunManager } from "./run-manager.js";
import { detectSkillAwareMode, SdkDriver } from "./sdk-driver.js";
import { installSkill } from "./skill-loader.js";
import { buildSleepPreventionCommand } from "./sleep-preventer.js";
import {
  listActiveTasks,
  readTaskStatus,
  type StatusManagerIO,
  writeTaskStatus,
} from "./status-manager.js";
import { decideWorktreeCleanup, isValidWorktreeSource } from "./worktree-manager.js";

// Read package version for skill compatibility checks
const PACKAGE_VERSION = JSON.parse(
  readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname), "..", "package.json"),
    "utf-8",
  ),
).version as string;

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

/**
 * Default base delay in milliseconds for exponential backoff on hard failures.
 * Used as the default value for `LoopConfig.backoffBaseMs`.
 */
export const DEFAULT_BACKOFF_BASE_MS = 60_000;

/**
 * Default maximum number of concurrent active Forge loops allowed.
 * Used as the default value for `LoopConfig.maxConcurrentLoops`.
 */
export const DEFAULT_MAX_CONCURRENT_LOOPS = 6;

// ---------------------------------------------------------------------------
// Tier validation
// ---------------------------------------------------------------------------

/** Known routing tiers for --tier validation. */
export const VALID_TIERS: ReadonlySet<string> = new Set<string>(["light", "standard", "full"]);

// ---------------------------------------------------------------------------
// Supported locales
// ---------------------------------------------------------------------------

/** Supported locale codes for --lang validation. */
export const SUPPORTED_LOCALES: ReadonlySet<string> = new Set<string>(["zh", "en"]);

// ---------------------------------------------------------------------------
// PUA task type validation
// ---------------------------------------------------------------------------

/** Known PUA task types for --pua-task-type validation. */
const VALID_PUA_TASK_TYPES: ReadonlySet<string> = new Set<string>([
  "debug",
  "build",
  "research",
  "architecture",
  "performance",
  "review",
  "deploy",
  "general",
]);

// ---------------------------------------------------------------------------
// Worktree notes backup (R4)
// ---------------------------------------------------------------------------

/**
 * Copy the notes file from a worktree to the main repo's run directory
 * before the worktree is deleted.
 *
 * This ensures iteration history is preserved even when the worktree is
 * removed after a zero-commit run. On any failure (missing source file,
 * permission error, etc.) the function returns `{ success: false }` with
 * an error description — callers should warn but not block worktree
 * deletion.
 *
 * @param worktreeNotesPath  Absolute path to the notes.md inside the worktree.
 * @param mainRepoRunDir     Absolute path to the main repo `.forge/runs/<runId>/` directory.
 * @returns `{ success: true }` on success, `{ success: false, error }` on failure.
 */
export function backupWorktreeNotes(
  worktreeNotesPath: string,
  mainRepoRunDir: string,
): { success: boolean; error?: string } {
  try {
    if (!existsSync(worktreeNotesPath)) {
      return { success: false, error: `Notes file not found: ${worktreeNotesPath}` };
    }

    // Ensure the destination directory exists in the main repo
    mkdirSync(mainRepoRunDir, { recursive: true });

    const destPath = path.join(mainRepoRunDir, "notes.md");
    copyFileSync(worktreeNotesPath, destPath);

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// CLI options interface
// ---------------------------------------------------------------------------

interface CliOptions {
  maxIterations?: number;
  maxTokens?: number;
  stopWhen?: string;
  preventSleep: string;
  worktree: boolean;
  maxBudgetUsd?: number;
  tier?: string;
  type?: string;
  phase?: string;
  nature?: string;
  pua?: boolean;
  puaTaskType?: string;
  resume?: string;
  lang?: string;
  logFormat?: string;
  logLevel?: string;
  logFile?: string;
  sandbox?: boolean | string;
  forceNoHooks?: boolean;
  skillsDir?: string;
  agent?: string;
  noWarmup?: boolean;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const program = new Command();

  // SKILL plugin management subcommand
  const skillCmd = new Command("skill").description("SKILL plugin management");

  skillCmd
    .command("install <path>")
    .description("Install a SKILL plugin from a local directory")
    .action(async (skillPath: string) => {
      const cwd = process.cwd();
      const resolvedSource = path.resolve(skillPath);
      const targetRoot = path.join(cwd, "skills");

      if (!existsSync(resolvedSource)) {
        // biome-ignore lint/suspicious/noConsole: skill install runs before logSink is configured
        console.error(`Error: Source path does not exist: ${skillPath}`);
        process.exit(1);
      }

      const result = installSkill(resolvedSource, targetRoot, PACKAGE_VERSION);
      if (result.success) {
        // biome-ignore lint/suspicious/noConsole: skill install runs before logSink is configured
        console.log(`✅ ${result.message}`);
        process.exit(0);
      } else {
        // biome-ignore lint/suspicious/noConsole: skill install runs before logSink is configured
        console.error(`❌ ${result.message}`);
        process.exit(1);
      }
    });

  program.addCommand(skillCmd);

  program
    .name("forge-loop")
    .description("Run an autonomous loop with Claude Code Agent SDK")
    .argument("<objective>", "The objective for the autonomous loop")
    .option("--max-iterations <n>", "Maximum number of iterations", parseInt)
    .option("--max-tokens <n>", "Maximum cumulative token limit", parseInt)
    .option("--stop-when <condition>", "Natural-language stop condition")
    .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
    .option("--worktree", "Run in a separate Git worktree", false)
    .option("--max-budget-usd <amount>", "Maximum dollar budget", parseFloat)
    .option("--tier <tier>", "Preset routing tier (light|standard|full)")
    .option("--type <type>", "Preset task type (frontend|backend|fullstack|data|infra|docs)")
    .option("--phase <phase>", "Preset project phase (greenfield|iteration|refactor|bugfix)")
    .option("--nature <nature>", "Preset work nature (feature|refactor|bugfix)")
    .option("--pua", "Enable PUA Quality Engine", false)
    .option(
      "--pua-task-type <type>",
      "PUA task type (debug|build|research|architecture|performance|review|deploy|general)",
    )
    .option("--resume <branchName>", "Resume an existing run on a forge/ branch")
    .option("--lang <locale>", "Set display language (zh|en)")
    .option("--log-format <text|json>", "Log output format (text|json)", "text")
    .option("--log-level <debug|info|warn|error>", "Minimum log level", "info")
    .option("--log-file <path>", "Write JSON logs to file (dual-write mode)")
    .option(
      "--sandbox [profile]",
      "Enable sandbox mode with fine-grained access control. Optionally specify a profile name.",
    )
    .option("--force-no-hooks", "Skip hooks protection validation (use at your own risk)", false)
    .option("--skills-dir <path>", "Load external SKILL plugins from directory")
    .option("--agent <name>", "Agent to use for iterations (claude|mock)", "claude")
    .option("--no-warmup", "Skip warm-up spawn (for sandbox/CI)", false)
    .action(async (objective: string, opts: CliOptions) => {
      const cwd = process.cwd();
      const preventSleep = opts.preventSleep !== "off";
      const useWorktree = opts.worktree;

      // ---------------------------------------------------------------
      // Validate git repo and working tree
      // ---------------------------------------------------------------
      try {
        execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
          cwd,
          stdio: "pipe",
        });
      } catch {
        throw new CliError("Error: Current directory is not a Git repository.");
      }

      if (!useWorktree && !opts.resume) {
        const status = execFileSync("git", ["status", "--porcelain"], {
          cwd,
          encoding: "utf-8",
        }).trim();

        if (status !== "") {
          throw new CliError(
            "Error: Working tree is not clean. Commit or stash changes before running, or use --worktree.",
          );
        }
      }

      // ---------------------------------------------------------------
      // Validate worktree source branch
      // ---------------------------------------------------------------
      if (useWorktree) {
        const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd,
          encoding: "utf-8",
        }).trim();

        if (!isValidWorktreeSource(currentBranch)) {
          throw new CliError(
            "Error: Cannot create a worktree from a forge/ branch. Switch to main or another non-forge branch first.",
          );
        }
      }

      // ---------------------------------------------------------------
      // Detect Skill-aware mode and validate .forge/ directory
      // ---------------------------------------------------------------
      const hasForgeDir = detectSkillAwareMode(cwd);
      const hasSkillOptions = !!(opts.tier || opts.type || opts.phase || opts.nature);
      const skillAware = hasForgeDir || hasSkillOptions;

      if (!hasForgeDir && hasSkillOptions) {
        throw new CliError(
          "Error: --tier, --type, --phase, and --nature require a .forge/ directory. Run `forge init` first.",
        );
      }

      // ---------------------------------------------------------------
      // Ensure glossary exists (skills-cross-pollination Requirement 1)
      // ---------------------------------------------------------------
      if (hasForgeDir) {
        const glossaryFs: GlossaryFs = {
          exists: (p) => existsSync(p),
          readFile: (p) => readFileSync(p, "utf-8"),
          writeFile: (p, c) => {
            mkdirSync(path.dirname(p), { recursive: true });
            writeFileSync(p, c, "utf-8");
          },
        };
        ensureGlossaryExists(glossaryFs, { path: path.join(cwd, ".forge", "glossary.md") });
      }

      // ---------------------------------------------------------------
      // Validate --tier value against known set (Req 10.4)
      // ---------------------------------------------------------------
      if (opts.tier && !VALID_TIERS.has(opts.tier)) {
        throw new CliError(
          `Error: Invalid --tier value "${opts.tier}". Valid options: ${[...VALID_TIERS].join(", ")}`,
        );
      }

      // ---------------------------------------------------------------
      // Validate --lang value and detect locale (i18n)
      // ---------------------------------------------------------------
      if (opts.lang && !SUPPORTED_LOCALES.has(opts.lang)) {
        throw new CliError(
          `Error: Invalid --lang value "${opts.lang}". Valid options: ${[...SUPPORTED_LOCALES].join(", ")}`,
        );
      }

      // ---------------------------------------------------------------
      // Validate --log-format and --log-level values (Req 2.4, 3.1)
      // ---------------------------------------------------------------
      const VALID_LOG_FORMATS = new Set(["text", "json"]);
      const VALID_LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

      if (opts.logFormat && !VALID_LOG_FORMATS.has(opts.logFormat)) {
        throw new CliError(
          `Error: Invalid --log-format value "${opts.logFormat}". Valid options: ${[...VALID_LOG_FORMATS].join(", ")}`,
        );
      }
      if (opts.logLevel && !VALID_LOG_LEVELS.has(opts.logLevel)) {
        throw new CliError(
          `Error: Invalid --log-level value "${opts.logLevel}". Valid options: ${[...VALID_LOG_LEVELS].join(", ")}`,
        );
      }

      // ---------------------------------------------------------------
      // Validate --log-file path (Req 1.1, 1.4)
      // ---------------------------------------------------------------
      if (opts.logFile !== undefined && opts.logFile.trim() === "") {
        throw new CliError("Error: --log-file requires a non-empty file path.");
      }
      if (opts.logFile) {
        try {
          validateFileWritable(opts.logFile);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new CliError(`Error: --log-file path is not writable: ${message}`);
        }
      }

      // Read config.md lang field
      let configLang: string | null = null;
      try {
        const configPath = path.join(cwd, ".forge", "config.md");
        if (existsSync(configPath)) {
          const configContent = readFileSync(configPath, "utf-8");
          configLang = extractConfigLang(configContent);
        }
      } catch {
        // Config read failure is non-blocking — continue with other sources.
      }

      // Detect locale from all sources
      const localeResult = detectLocale(
        {
          cliLang: opts.lang,
          configLang: configLang ?? undefined,
          envLang: process.env.FORGE_LANG,
          systemLocale: process.env.LANG || process.env.LC_ALL,
        },
        SUPPORTED_LOCALES,
      );

      if (localeResult.warning) {
        // biome-ignore lint/suspicious/noConsole: locale warning runs before logSink is configured
        console.warn(`Warning: ${localeResult.warning}`);
      }

      // Load translation files and create I18nConfig
      const localesDir = path.join(
        path.dirname(new URL(import.meta.url).pathname),
        "..",
        "locales",
      );
      const enData = parseTranslationFile(
        readFileSync(path.join(localesDir, "en.json"), "utf-8"),
        "locales/en.json",
      );
      const zhData = parseTranslationFile(
        readFileSync(path.join(localesDir, "zh.json"), "utf-8"),
        "locales/zh.json",
      );

      const i18nConfig: I18nConfig = {
        locale: localeResult.locale,
        defaultLocale: "en",
        translations: { en: enData, zh: zhData },
      };

      /** Convenience translation function. */
      const _t = (key: string, params?: Record<string, string>): string =>
        translate(i18nConfig, key, params);

      // ---------------------------------------------------------------
      // Detect active tasks in StatusFile(s) (Req 10.2)
      // ---------------------------------------------------------------
      if (hasForgeDir) {
        try {
          const managerIO: StatusManagerIO = {
            exists: (p) => existsSync(p),
            dirExists: (p) => existsSync(p),
            read: (p) => readFileSync(p, "utf-8"),
            write: (p, content) => {
              mkdirSync(path.dirname(p), { recursive: true });
              writeFileSync(p, content, "utf-8");
            },
            listDir: (p) => readdirSync(p),
            move: (src, dest) => {
              mkdirSync(path.dirname(dest), { recursive: true });
              renameSync(src, dest);
            },
            mkdirp: (p) => mkdirSync(p, { recursive: true }),
          };
          const forgeRoot = path.join(cwd, ".forge");
          const activeTasks = listActiveTasks(managerIO, forgeRoot);
          if (activeTasks.length === 1) {
            // biome-ignore lint/suspicious/noConsole: active task warning runs before logSink
            console.warn(_t("cli.warning.activeTask", { phase: activeTasks[0].phase }));
          } else if (activeTasks.length > 1) {
            // biome-ignore lint/suspicious/noConsole: active task warning runs before logSink
            console.warn(_t("cli.warning.activeTasks", { count: String(activeTasks.length) }));
            for (const task of activeTasks) {
              // biome-ignore lint/suspicious/noConsole: active task warning runs before logSink
              console.warn(`  • ${task.taskName} (${task.phase})`);
            }
          }
        } catch (err) {
          // StatusFile read failure is non-blocking — continue startup.
          // biome-ignore lint/suspicious/noConsole: status check runs before logSink
          console.warn(
            `[debug] StatusFile read failed during startup: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // ---------------------------------------------------------------
      // Build LoopConfig and RunLimits
      // ---------------------------------------------------------------
      // Validate --skills-dir if provided
      if (opts.skillsDir) {
        const resolved = path.resolve(opts.skillsDir);
        if (resolved.includes("..") || !existsSync(resolved)) {
          throw new CliError(
            `Error: --skills-dir path is invalid or does not exist: ${opts.skillsDir}`,
          );
        }
      }

      // ---------------------------------------------------------------
      // Create AgentRegistry, register builtins, and resolve agent
      // ---------------------------------------------------------------
      // Load sandbox profile if --sandbox is specified
      let sandboxProfile: import("./sandbox-profile.js").SandboxProfile | undefined;
      if (opts.sandbox) {
        const { loadSandboxProfile: loadProfile } = await import("./sandbox-profile.js");
        const profileName = typeof opts.sandbox === "string" ? opts.sandbox : undefined;
        try {
          sandboxProfile = loadProfile(cwd, profileName);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new CliError(`Error: ${message}`);
        }
      }

      const agentName = opts.agent ?? "claude";

      const loopConfig: LoopConfig = {
        agent: agentName as LoopConfig["agent"],
        maxConsecutiveFailures: 3,
        preventSleep,
        backoffBaseMs: DEFAULT_BACKOFF_BASE_MS,
        maxConcurrentLoops: DEFAULT_MAX_CONCURRENT_LOOPS,
        skillsDir: opts.skillsDir,
      };

      const limits: RunLimits = {
        maxIterations: opts.maxIterations,
        maxTokens: opts.maxTokens,
        stopWhen: opts.stopWhen,
      };

      // ---------------------------------------------------------------
      // Set up run (new run, worktree, or resume)
      // ---------------------------------------------------------------
      let runSetup: ReturnType<typeof RunManager.setupNewRun>;
      let worktreePath: string | undefined;
      let effectiveCwd = cwd;

      if (opts.resume) {
        // --resume <branchName>: restore an existing run (R13)
        const resumeBranch = opts.resume;

        // Validate that the branch exists
        if (!branchExists(resumeBranch, cwd)) {
          throw new CliError(_t("cli.error.branchNotFound", { branch: resumeBranch }));
        }

        // Checkout the branch before resuming
        execFileSync("git", ["checkout", resumeBranch], { cwd, stdio: "pipe" });

        // Restore run context and notes
        const resumed = RunManager.resumeRun(resumeBranch, cwd);

        // Validate that a matching run directory was found (runId is not
        // a freshly generated UUID — resumeRun creates a new one when no
        // existing run matches, but the notes will be empty)
        if (resumed.lastIteration === 0) {
          // Check if the run directory actually had notes — a lastIteration
          // of 0 with an existing notes file that has content is still valid
          // (first iteration may not have completed). We only error when the
          // run directory itself could not be found for this branch.
          const notesContent = readFileSync(resumed.notesPath, "utf-8");
          if (!notesContent.includes(resumeBranch)) {
            throw new CliError(_t("cli.error.noRunDirectory", { branch: resumeBranch }));
          }
        }

        runSetup = resumed;
        // biome-ignore lint/suspicious/noConsole: resume message runs before logSink
        console.log(
          _t("cli.loop.resuming", {
            runId: resumed.runId,
            branch: resumeBranch,
            iteration: String(resumed.lastIteration),
          }),
        );
      } else if (useWorktree) {
        // Check concurrent loop limit (based on active processes, not worktrees)
        if (hasForgeDir) {
          const activeSessions = countActiveSessions(path.join(cwd, ".forge"));
          if (activeSessions >= loopConfig.maxConcurrentLoops) {
            throw new CliError(
              `Error: ${activeSessions} active loop(s) already running (limit: ${loopConfig.maxConcurrentLoops}). Wait for a loop to finish or increase the limit.`,
            );
          }
        }

        const worktreeSetup = RunManager.setupWorktree(objective, cwd, _t);
        runSetup = worktreeSetup;
        worktreePath = worktreeSetup.worktreePath;
        effectiveCwd = worktreeSetup.worktreePath;
      } else {
        runSetup = RunManager.setupNewRun(objective, cwd);
      }

      // Emit structured run_started event for downstream consumers (desktop app, CI).
      const ipcEmitter = new IpcEmitter(runSetup.runId);
      ipcEmitter.emitVersion();
      ipcEmitter.emit({
        event: "forge_loop_run_started",
        branch_name: runSetup.branchName,
        worktree_path: worktreePath ?? null,
      });

      // ---------------------------------------------------------------
      // Spawn sleep prevention process
      // ---------------------------------------------------------------
      let sleepProcess: ChildProcess | null = null;

      // Warm-up spawn + Agent adapter (moved after runSetup is available)
      if (!opts.noWarmup) {
        const warmupArgs = [
          "--print",
          "--output-format=stream-json",
          "--max-turns=1",
          "--permission-mode=bypassPermissions",
          "--dangerously-skip-permissions",
        ];
        const warmupEnv = { ...process.env, CLAUDE_CODE_WORKFLOWS: "1" };
        const warmup = spawn("claude", warmupArgs, {
          cwd: effectiveCwd,
          env: warmupEnv,
          stdio: ["pipe", "pipe", "pipe"],
        });
        warmup.stdin?.write(
          `${JSON.stringify({ type: "user", message: { role: "user", content: "_" } })}\n`,
        );
        warmup.stdin?.end();

        const warmupExitCode = await new Promise<number>((resolve) => {
          const timeout = setTimeout(() => {
            warmup.kill("SIGKILL");
            resolve(1);
          }, 30_000);
          warmup.on("exit", (code) => {
            clearTimeout(timeout);
            resolve(code ?? 1);
          });
        });

        if (warmupExitCode !== 0) {
          throw new CliError(`Warm-up failed (exit ${warmupExitCode})`);
        }
        writeFileSync(
          path.join(runSetup.runDir, "warm-up.json"),
          JSON.stringify({ exitCode: warmupExitCode }),
        );
      } // end warmup gate

      // Agent adapter: CliSubprocessDriver replaces agent-sdk
      const agentAdapter = new CliSubprocessDriver({
        cwd: effectiveCwd,
        runId: runSetup.runId,
        runDir: runSetup.runDir,
        permissionMode: "bypassPermissions",
        dangerouslySkipPermissions: true,
        maxTurns: Math.min(opts.maxIterations ?? 30, 30),
        // Plumb through resume flag (R5.6)
        resumeSessionId: opts.resume,
      });

      if (preventSleep) {
        const sleepCmd = buildSleepPreventionCommand(process.platform, process.pid);
        if (sleepCmd) {
          sleepProcess = spawn(sleepCmd.command, sleepCmd.args, {
            detached: sleepCmd.detached,
            stdio: "ignore",
          });
          // Unref so the sleep process doesn't keep the event loop alive.
          sleepProcess.unref();
        }
      }

      // ---------------------------------------------------------------
      // Create LogSink (Req 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 8.1, 8.3)
      // ---------------------------------------------------------------

      // Read log config from .forge/config.md frontmatter
      let fileLogConfig = {
        logFormat: null as "text" | "json" | null,
        logLevel: null as import("./logger/types.js").LogLevel | null,
        logFile: null as string | null,
      };
      try {
        const configPath = path.join(cwd, ".forge", "config.md");
        if (existsSync(configPath)) {
          const configContent = readFileSync(configPath, "utf-8");
          fileLogConfig = parseLogConfig(configContent);
        }
      } catch {
        // Config read failure is non-blocking — continue with defaults.
      }

      // Merge CLI options with config file values (CLI takes priority)
      const resolvedLogConfig = mergeLogConfig(
        { logFormat: opts.logFormat, logLevel: opts.logLevel, logFile: opts.logFile },
        fileLogConfig,
      );

      // Validate resolved log file path if it came from config file (CLI path already validated above)
      if (resolvedLogConfig.logFile && !opts.logFile) {
        try {
          validateFileWritable(resolvedLogConfig.logFile);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new CliError(`Error: log_file path from config is not writable: ${message}`);
        }
      }

      const logSinkConfig: LogSinkConfig = {
        format: resolvedLogConfig.format,
        level: resolvedLogConfig.level,
      };

      let logSink: ReturnType<typeof createLogSink>;
      if (resolvedLogConfig.logFile) {
        // Dual-write mode: stdout + file
        const stdoutSink = createLogSink(logSinkConfig);
        const fileWriter = createFileWriter(resolvedLogConfig.logFile);
        const fileSinkConfig: LogSinkConfig = { format: "json", level: resolvedLogConfig.level };
        const fileSink = createLogSink(fileSinkConfig, fileWriter);
        logSink = createDualSink(stdoutSink, fileSink);
      } else {
        // Single sink: stdout only
        logSink = createLogSink(logSinkConfig);
      }

      // ---------------------------------------------------------------
      // Process lifecycle: startup cleanup and PID file management
      // ---------------------------------------------------------------
      const sessionId = runSetup.runId;
      const pidsBaseDir = path.join(cwd, ".forge");
      if (hasForgeDir) {
        try {
          const staleOrphans = await cleanupStaleSessions(pidsBaseDir);
          if (staleOrphans.length > 0) {
            logSink.log(
              createLogEntry(
                "orphan_cleanup",
                "warn",
                `Cleaned ${staleOrphans.length} stale orphan process(es) from previous runs`,
                { runId: sessionId },
              ),
            );
          }
        } catch {
          // Non-blocking: stale session cleanup failure should not block startup
        }

        try {
          const ppidOrphans = await detectPpidOrphans(["forge", "vitest", "caffeinate"], 3600);
          if (ppidOrphans.length > 0) {
            const autoKillResult = cleanupOrphans(ppidOrphans, 3600);
            if (autoKillResult.killed.length > 0) {
              logSink.log(
                createLogEntry(
                  "orphan_terminated",
                  "warn",
                  `Auto-terminated ${autoKillResult.killed.length} orphan process(es)`,
                  { runId: sessionId },
                ),
              );
            }
            if (autoKillResult.warned.length > 0) {
              for (const pid of autoKillResult.warned) {
                const orphan = ppidOrphans.find((o) => o.pid === pid);
                if (orphan) {
                  logSink.log(
                    createLogEntry(
                      "orphan_detected",
                      "warn",
                      `Detected orphan process: PID ${pid} (${orphan.command})`,
                      { runId: sessionId },
                    ),
                  );
                }
              }
            }
          }
        } catch {
          // Non-blocking: orphan detection failure should not block startup
        }

        try {
          ProcessRegistry.resetInstance();
          const registry = ProcessRegistry.getInstance();
          const serialized = JSON.parse(registry.serialize()) as PidFileContent;
          writePidFile(sessionId, serialized, pidsBaseDir);
        } catch {
          // Non-blocking: PID file write failure should not block startup
        }
      }

      // ---------------------------------------------------------------
      // Create EffectExecutor and SdkDriver
      // ---------------------------------------------------------------
      const effectExecutor = new EffectExecutor({
        cwd: effectiveCwd,
        onNotesUpdate: (content: string) => {
          RunManager.persistNotes(runSetup.notesPath, content);
        },
        onLog: (message: string) => {
          logSink.log(createLogEntry("effect_log", "info", message, { runId: runSetup.runId }));
        },
      });

      // -------------------------------------------------------------
      // Build StatusManager I/O for parallel status tracking
      // -------------------------------------------------------------
      const forgeRoot = path.join(effectiveCwd, ".forge");
      const managerIO: StatusManagerIO = {
        exists: (p) => existsSync(p),
        dirExists: (p) => existsSync(p),
        read: (p) => readFileSync(p, "utf-8"),
        write: (p, content) => {
          mkdirSync(path.dirname(p), { recursive: true });
          writeFileSync(p, content, "utf-8");
        },
        listDir: (p) => readdirSync(p),
        move: (src, dest) => {
          mkdirSync(path.dirname(dest), { recursive: true });
          renameSync(src, dest);
        },
        mkdirp: (p) => mkdirSync(p, { recursive: true }),
      };

      const driver = new SdkDriver(
        {
          objective,
          loopConfig,
          limits,
          cwd: effectiveCwd,
          runId: runSetup.runId,
          runDir: runSetup.runDir,
          baseCommit: runSetup.baseCommit,
          notesPath: runSetup.notesPath,
          branchName: runSetup.branchName,
          presetTier: opts.tier,
          presetTaskType: opts.type,
          presetProjectPhase: opts.phase,
          presetWorkNature: opts.nature,
          skillAware,
          puaEnabled: opts.pua === true,
          puaTaskType:
            opts.puaTaskType && VALID_PUA_TASK_TYPES.has(opts.puaTaskType)
              ? (opts.puaTaskType as TaskType)
              : opts.pua
                ? ("general" as TaskType)
                : undefined,
          taskName: objective,
          readStatusFile: () => readTaskStatus(managerIO, forgeRoot, objective),
          writeStatusFile: (content) => writeTaskStatus(managerIO, forgeRoot, objective, content),
          t: _t,
          logSinkConfig,
          sandboxEnabled: !!opts.sandbox,
          sdkNativeSandbox: !!sandboxProfile,
          forceNoHooks: opts.forceNoHooks === true,
          ipcEmitter,
        },
        effectExecutor,
        agentAdapter,
      );

      // ---------------------------------------------------------------
      // Wire signal handlers
      // ---------------------------------------------------------------
      const handleSignal = async () => {
        driver.requestStop();
        const stopPromise = driver.getStopPromise();
        if (stopPromise) {
          try {
            await stopPromise;
          } catch {
            // Ignore cleanup errors
          }
        }
        const registry = ProcessRegistry.getInstance();
        try {
          await registry.shutdownAll();
        } catch {
          // Ignore shutdown errors
        }
        deletePidFile(sessionId, pidsBaseDir);
        process.exit(0);
      };

      process.on("SIGINT", handleSignal);
      process.on("SIGTERM", handleSignal);
      process.on("SIGHUP", handleSignal);

      // Process group cleanup on exit (synchronous — catches abnormal exits).
      // Only kill the process group on non-zero exit to avoid converting a
      // clean exit (code 0) into a signal exit (-1) observed by the parent.
      process.on("exit", (code) => {
        if (code !== 0) {
          try {
            process.kill(-process.pid, "SIGTERM");
          } catch {
            // Ignore errors during exit cleanup
          }
        }
      });

      // ---------------------------------------------------------------
      // Run the driver loop
      // ---------------------------------------------------------------
      try {
        const result = await driver.run();

        // Emit run_completed for downstream consumers
        ipcEmitter.emit({
          event: "run_completed",
          total_iterations: result.commitCount,
          status: "success",
        });

        // Persist final notes.
        RunManager.persistNotes(
          runSetup.notesPath,
          result.notesDocument.entries.length > 0 ? formatNotesDocument(result.notesDocument) : "",
        );

        // Handle worktree cleanup.
        if (useWorktree && worktreePath) {
          const decision = decideWorktreeCleanup(result.commitCount);
          if (decision.action === "remove") {
            // Backup notes from worktree to main repo before deletion (R4)
            const mainRepoRunDir = path.join(cwd, ".forge", "runs", runSetup.runId);
            const worktreeNotesPath = runSetup.notesPath;
            const backupResult = backupWorktreeNotes(worktreeNotesPath, mainRepoRunDir);
            if (!backupResult.success) {
              logSink.log(
                createLogEntry(
                  "worktree_notes_backup_failed",
                  "warn",
                  _t("cli.warning.worktreeNotesBackupFailed", {
                    error: backupResult.error ?? "unknown",
                  }),
                  { runId: runSetup.runId },
                ),
              );
            }

            try {
              execFileSync("git", ["worktree", "remove", worktreePath], {
                cwd,
                stdio: "pipe",
              });
              logSink.log(
                createLogEntry(
                  "worktree_removed",
                  "info",
                  _t("cli.loop.worktreeRemoved", { reason: decision.reason }),
                  { runId: runSetup.runId },
                ),
              );
            } catch (cleanupError) {
              logSink.log(
                createLogEntry(
                  "worktree_remove_failed",
                  "error",
                  `Failed to remove worktree at ${worktreePath}: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`,
                  { runId: runSetup.runId },
                ),
              );
            }
          } else {
            logSink.log(
              createLogEntry(
                "worktree_preserved",
                "info",
                _t("cli.loop.worktreePreserved", { reason: decision.reason }),
                { runId: runSetup.runId },
              ),
            );
          }
        }
      } catch (err) {
        // Emit error event for desktop / CI consumers (R8.3, R10)
        const errorMessage = err instanceof Error ? err.message : String(err);
        // Classify: CliError → user error (non-retryable); other → unexpected
        const isCliError = err instanceof CliError;
        const exitCode = isCliError ? 1 : 139;
        const classification = classifyExitCode(exitCode);
        ipcEmitter.emitError({
          code: isCliError ? "cli_error" : "unexpected_failure",
          message: errorMessage,
          fatal: true,
          retryable: classification.retryable,
        });
        throw err;
      } finally {
        // Clean up signal handlers.
        process.removeListener("SIGINT", handleSignal);
        process.removeListener("SIGTERM", handleSignal);
        process.removeListener("SIGHUP", handleSignal);

        // Shutdown ProcessRegistry and delete PID file.
        try {
          await ProcessRegistry.getInstance().shutdownAll();
        } catch {
          // Ignore shutdown errors during cleanup
        }
        try {
          deletePidFile(sessionId, pidsBaseDir);
        } catch {
          // Ignore PID file deletion errors
        }

        // Kill sleep prevention process.
        if (sleepProcess) {
          try {
            sleepProcess.kill();
          } catch (cleanupError) {
            logSink.log(
              createLogEntry(
                "sleep_kill_failed",
                "error",
                `Failed to kill sleep prevention process: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
                { runId: sessionId },
              ),
            );
          }
        }

        // Close agent adapter (shutdown subprocess if still running).
        try {
          await (agentAdapter as { shutdown?: (sig: string) => Promise<void> }).shutdown?.(
            "SIGTERM",
          );
        } catch (cleanupError) {
          logSink.log(
            createLogEntry(
              "agent_close_failed",
              "error",
              `Failed to close SDK agent adapter: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
              { runId: sessionId },
            ),
          );
        }
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  if (err instanceof CliError) {
    // biome-ignore lint/suspicious/noConsole: top-level error handler has no logSink
    console.error(err.message);
    process.exit(err.exitCode);
  }
  const message = err instanceof Error ? err.message : String(err);
  // biome-ignore lint/suspicious/noConsole: top-level error handler has no logSink
  console.error(message);
  process.exit(1);
});
