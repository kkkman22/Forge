#!/usr/bin/env node
/**
 * Decide whether to run cmux config doctor (R4.1).
 * @param {{ cwd: string }} env
 * @param {(path: string) => boolean} fsExists
 */
export function shouldRunCmuxDoctor(env: {
    cwd: string;
}, fsExists: (path: string) => boolean): {
    run: boolean;
    reason: string;
} | {
    run: boolean;
    reason?: undefined;
};
/**
 * @param {{ pluginRoot: string|undefined, cwd: string }} env
 * @param {(path: string) => boolean} fsExists
 * @returns {{ kind: "show" } | { kind: "skip", reason: "already_initialized"|"user_dismissed"|"no_plugin_context" }}
 */
export function shouldShowBootstrap(env: {
    pluginRoot: string | undefined;
    cwd: string;
}, fsExists: (path: string) => boolean): {
    kind: "show";
} | {
    kind: "skip";
    reason: "already_initialized" | "user_dismissed" | "no_plugin_context";
};
