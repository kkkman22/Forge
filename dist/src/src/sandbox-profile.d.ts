/**
 * Sandbox Profile — configuration management for SDK native sandbox.
 *
 * Loads .forge/sandbox.json (v1 or v2 format), resolves named profiles,
 * and converts Forge configuration to SDK SandboxSettings.
 */
import type { SandboxSettings } from "@anthropic-ai/claude-agent-sdk";
export interface SandboxConfigV1 {
    fileSystem: {
        allow: string[];
        deny: string[];
    };
    network: {
        mode: "none" | "restricted" | "open";
        allow?: string[];
    };
}
export interface SandboxConfigV2 {
    version: 2;
    activeProfile: string;
    profiles: Record<string, SandboxProfile>;
}
export interface SandboxProfile {
    fileSystem: {
        allow: string[];
        deny: string[];
        denyRead?: string[];
    };
    network: {
        mode: "none" | "restricted" | "open";
        allow?: string[];
        deny?: string[];
    };
}
/**
 * Complete tool set for Forge Loop unattended execution.
 * Covers all stages: plan/decide/build/review/ship.
 * Sandbox mode: all tools pre-approved, security boundary from OS sandbox + frozen zone hook.
 */
export declare const FORGE_LOOP_TOOLS: readonly string[];
/**
 * Load a sandbox profile from .forge/sandbox.json.
 * Supports v1 (auto-upgrade) and v2 formats.
 * Returns default builder profile when no config file exists.
 */
export declare function loadSandboxProfile(cwd: string, profileName?: string): SandboxProfile;
/**
 * Convert a Forge SandboxProfile to SDK SandboxSettings.
 */
export declare function toSdkSandboxSettings(profile: SandboxProfile, _cwd: string): SandboxSettings;
