/**
 * Platform-specific sleep prevention command generation.
 *
 * All functions are pure: they accept parameters and return command
 * descriptors without spawning processes or performing I/O. The SKILL
 * layer is responsible for executing the returned commands.
 *
 * Design reference: gnhf-inspired-enhancements § sleep-preventer.ts
 * **Validates: Requirements 8.1–8.7**
 */
import type { SleepPreventionCommand } from "./loop-types.js";
/** Platforms for which sleep prevention commands can be generated. */
export type SupportedPlatform = "darwin" | "linux" | "win32";
/**
 * Type guard that narrows an arbitrary platform string to a
 * {@link SupportedPlatform}.
 *
 * Returns `true` for `"darwin"`, `"linux"`, and `"win32"`.
 *
 * @param platform  The `process.platform` value to check.
 * @returns Whether the platform is supported for sleep prevention.
 */
export declare function isSupportedPlatform(platform: string): platform is SupportedPlatform;
/**
 * Build a macOS `caffeinate` command that prevents idle sleep for the
 * lifetime of the given process.
 *
 * The `-i` flag prevents idle sleep and `-w` watches the specified PID,
 * automatically exiting when that process terminates.
 *
 * The child is detached so it survives if the parent's stdio is closed.
 *
 * @param pid  The process ID to watch.
 * @returns A {@link SleepPreventionCommand} for macOS.
 */
export declare function buildCaffeinateCommand(pid: number): SleepPreventionCommand;
/**
 * Build a Linux `systemd-inhibit` command that re-executes the current
 * process under an idle/sleep inhibition lock.
 *
 * The command wraps the Node.js process so that `systemd-inhibit` holds
 * the lock for the entire duration of the child process.
 *
 * @param execPath   The path to the Node.js executable (`process.execPath`).
 * @param execArgv   Node.js CLI flags (`process.execArgv`), e.g. `["--inspect"]`.
 * @param scriptPath The entry-point script path (`process.argv[1]`).
 * @param argv       The remaining CLI arguments to forward.
 * @returns A {@link SleepPreventionCommand} for Linux.
 */
export declare function buildSystemdInhibitCommand(execPath: string, execArgv: string[], scriptPath: string, argv: string[]): SleepPreventionCommand;
/**
 * Build a PowerShell script string that prevents system sleep by calling
 * the Win32 `SetThreadExecutionState` API.
 *
 * The script:
 * 1. Defines a P/Invoke wrapper for `SetThreadExecutionState`.
 * 2. Sets `ES_CONTINUOUS | ES_SYSTEM_REQUIRED` to prevent sleep.
 * 3. Waits for the parent process (identified by `pid`) to exit.
 * 4. Restores the original state (`ES_CONTINUOUS` only) in a `finally` block.
 *
 * @param pid  The parent process ID to wait on.
 * @returns A PowerShell script string.
 */
export declare function buildPowerShellCommand(pid: number): string;
/**
 * Build a platform-specific sleep prevention command.
 *
 * - **darwin**: returns a `caffeinate` command via {@link buildCaffeinateCommand}.
 * - **linux**: returns a simplified `systemd-inhibit` command using
 *   `--what=idle:sleep --mode=block` with the current PID.
 * - **win32**: returns a `powershell.exe` command that executes the script
 *   from {@link buildPowerShellCommand}.
 * - **other**: returns `null` (unsupported platform).
 *
 * @param platform  The `process.platform` value.
 * @param pid       The current process ID.
 * @returns A {@link SleepPreventionCommand} or `null` for unsupported platforms.
 */
export declare function buildSleepPreventionCommand(platform: string, pid: number): SleepPreventionCommand | null;
