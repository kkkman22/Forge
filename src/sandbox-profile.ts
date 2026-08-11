/**
 * Sandbox Profile — configuration management for SDK native sandbox.
 *
 * Loads .tinkerman/sandbox.json (v1 or v2 format), resolves named profiles,
 * and converts Forge configuration to SDK SandboxSettings.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxSettings } from "@anthropic-ai/claude-agent-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// FORGE_LOOP_TOOLS constant
// ---------------------------------------------------------------------------

/**
 * Complete tool set for Forge Loop unattended execution.
 * Covers all stages: plan/decide/build/review/ship.
 * Sandbox mode: all tools pre-approved, security boundary from OS sandbox + frozen zone hook.
 */
export const FORGE_LOOP_TOOLS: readonly string[] = [
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
] as const;

// ---------------------------------------------------------------------------
// Default builder profile
// ---------------------------------------------------------------------------

const DEFAULT_BUILDER_PROFILE: SandboxProfile = {
  fileSystem: {
    allow: ["."],
    deny: [".tinkerman/sandbox.json", ".tinkerman/.sandbox-active.json"],
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
 * Load a sandbox profile from .tinkerman/sandbox.json.
 * Supports v1 (auto-upgrade) and v2 formats.
 * Returns default builder profile when no config file exists.
 */
export function loadSandboxProfile(cwd: string, profileName?: string): SandboxProfile {
  const configPath = join(cwd, ".tinkerman", "sandbox.json");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_BUILDER_PROFILE };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (_err: unknown) {
    return { ...DEFAULT_BUILDER_PROFILE };
  }

  const config = raw as Record<string, unknown>;

  // v2 format
  if (config.version === 2) {
    const v2 = config as unknown as SandboxConfigV2;
    const name = profileName ?? v2.activeProfile;
    const profile = v2.profiles[name];
    if (!profile) {
      const available = Object.keys(v2.profiles).join(", ");
      throw new Error(`Sandbox profile "${name}" not found. Available profiles: ${available}`);
    }
    return profile;
  }

  // v1 format — auto-upgrade to single profile
  const v1 = config as unknown as SandboxConfigV1;
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
export function toSdkSandboxSettings(profile: SandboxProfile, _cwd: string): SandboxSettings {
  const settings: SandboxSettings = {
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
  } else if (profile.network.mode === "restricted") {
    settings.network = {
      allowManagedDomainsOnly: true,
      allowedDomains: profile.network.allow ?? [],
      allowLocalBinding: true,
      ...(profile.network.deny && { deniedDomains: profile.network.deny }),
    };
  } else {
    // "open" — no network restrictions, but still set allowLocalBinding
    settings.network = {
      allowLocalBinding: true,
    };
  }

  return settings;
}
