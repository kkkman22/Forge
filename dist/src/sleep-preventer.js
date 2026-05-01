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
/**
 * Type guard that narrows an arbitrary platform string to a
 * {@link SupportedPlatform}.
 *
 * Returns `true` for `"darwin"`, `"linux"`, and `"win32"`.
 *
 * @param platform  The `process.platform` value to check.
 * @returns Whether the platform is supported for sleep prevention.
 */
export function isSupportedPlatform(platform) {
    return platform === "darwin" || platform === "linux" || platform === "win32";
}
// ---------------------------------------------------------------------------
// macOS — caffeinate
// ---------------------------------------------------------------------------
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
export function buildCaffeinateCommand(pid) {
    return {
        command: "caffeinate",
        args: ["-i", "-w", String(pid)],
        detached: false,
    };
}
// ---------------------------------------------------------------------------
// Linux — systemd-inhibit
// ---------------------------------------------------------------------------
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
export function buildSystemdInhibitCommand(execPath, execArgv, scriptPath, argv) {
    return {
        command: "systemd-inhibit",
        args: ["--what=idle:sleep", "--mode=block", execPath, ...execArgv, scriptPath, ...argv],
        detached: false,
    };
}
// ---------------------------------------------------------------------------
// Windows — PowerShell SetThreadExecutionState
// ---------------------------------------------------------------------------
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
export function buildPowerShellCommand(pid) {
    return [
        "Add-Type @'",
        "using System;",
        "using System.Runtime.InteropServices;",
        "public static class SleepBlock {",
        '  [DllImport("kernel32.dll")]',
        "  public static extern uint SetThreadExecutionState(uint flags);",
        "}",
        "'@;",
        "$ES_CONTINUOUS = 0x80000000;",
        "$ES_SYSTEM_REQUIRED = 0x00000001;",
        "[SleepBlock]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null;",
        `try { Wait-Process -Id ${pid} } catch { } finally { [SleepBlock]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null }`,
    ].join("\n");
}
// ---------------------------------------------------------------------------
// Unified command builder
// ---------------------------------------------------------------------------
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
export function buildSleepPreventionCommand(platform, pid) {
    if (!isSupportedPlatform(platform)) {
        return null;
    }
    switch (platform) {
        case "darwin":
            return buildCaffeinateCommand(pid);
        case "linux":
            return {
                command: "systemd-inhibit",
                args: ["--what=idle:sleep", "--mode=block"],
                detached: false,
            };
        case "win32":
            return {
                command: "powershell.exe",
                args: [
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    buildPowerShellCommand(pid),
                ],
                detached: false,
            };
    }
}
//# sourceMappingURL=sleep-preventer.js.map