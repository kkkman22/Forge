/**
 * Sandbox Profile — configuration management for SDK native sandbox.
 *
 * Loads .forge/sandbox.json (v1 or v2 format), resolves named profiles,
 * and converts Forge configuration to SDK SandboxSettings.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// ---------------------------------------------------------------------------
// FORGE_LOOP_TOOLS constant
// ---------------------------------------------------------------------------
/**
 * Complete tool set for Forge Loop unattended execution.
 * Covers all stages: plan/decide/build/review/ship.
 * Sandbox mode: all tools pre-approved, security boundary from OS sandbox + frozen zone hook.
 */
export const FORGE_LOOP_TOOLS = [
    "Read",
    "Write",
    "Edit",
    "Bash",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
    "Agent",
    "NotebookEdit",
    "TodoWrite",
];
// ---------------------------------------------------------------------------
// Default builder profile
// ---------------------------------------------------------------------------
const DEFAULT_BUILDER_PROFILE = {
    fileSystem: {
        allow: ["."],
        deny: [".forge/sandbox.json", ".forge/.sandbox-active.json"],
    },
    network: {
        mode: "restricted",
        allow: ["registry.npmjs.org", "api.anthropic.com"],
    },
};
// ---------------------------------------------------------------------------
// loadSandboxProfile
// ---------------------------------------------------------------------------
/**
 * Load a sandbox profile from .forge/sandbox.json.
 * Supports v1 (auto-upgrade) and v2 formats.
 * Returns default builder profile when no config file exists.
 */
export function loadSandboxProfile(cwd, profileName) {
    const configPath = join(cwd, ".forge", "sandbox.json");
    if (!existsSync(configPath)) {
        return { ...DEFAULT_BUILDER_PROFILE };
    }
    let raw;
    try {
        raw = JSON.parse(readFileSync(configPath, "utf-8"));
    }
    catch {
        return { ...DEFAULT_BUILDER_PROFILE };
    }
    const config = raw;
    // v2 format
    if (config.version === 2) {
        const v2 = config;
        const name = profileName ?? v2.activeProfile;
        const profile = v2.profiles[name];
        if (!profile) {
            const available = Object.keys(v2.profiles).join(", ");
            throw new Error(`Sandbox profile "${name}" not found. Available profiles: ${available}`);
        }
        return profile;
    }
    // v1 format — auto-upgrade to single profile
    const v1 = config;
    return {
        fileSystem: {
            allow: v1.fileSystem.allow,
            deny: v1.fileSystem.deny,
        },
        network: {
            mode: v1.network.mode,
            allow: v1.network.allow,
        },
    };
}
// ---------------------------------------------------------------------------
// toSdkSandboxSettings
// ---------------------------------------------------------------------------
/**
 * Convert a Forge SandboxProfile to SDK SandboxSettings.
 */
export function toSdkSandboxSettings(profile, _cwd) {
    const settings = {
        enabled: true,
        failIfUnavailable: true,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
    };
    // Filesystem mapping
    settings.filesystem = {
        allowWrite: profile.fileSystem.allow,
        denyWrite: profile.fileSystem.deny,
        ...(profile.fileSystem.denyRead && { denyRead: profile.fileSystem.denyRead }),
    };
    // Network mapping
    if (profile.network.mode === "none") {
        settings.network = {
            allowManagedDomainsOnly: true,
            allowedDomains: [],
            allowLocalBinding: true,
        };
    }
    else if (profile.network.mode === "restricted") {
        settings.network = {
            allowManagedDomainsOnly: true,
            allowedDomains: profile.network.allow ?? [],
            allowLocalBinding: true,
            ...(profile.network.deny && { deniedDomains: profile.network.deny }),
        };
    }
    else {
        // "open" — no network restrictions, but still set allowLocalBinding
        settings.network = {
            allowLocalBinding: true,
        };
    }
    return settings;
}
//# sourceMappingURL=sandbox-profile.js.map