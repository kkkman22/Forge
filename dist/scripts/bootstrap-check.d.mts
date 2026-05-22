#!/usr/bin/env node
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
