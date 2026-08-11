import type { Domain } from "./types.js";

export const EXCLUDED_PREFIXES = [
  "apps/",
  "dist/",
  "dist-plugin/",
  "node_modules/",
  ".git/",
  "test-results/",
  "apps/forge-loop-desktop/src-tauri/target/",
  ".claude/worktrees/",
  "api/",
] as const;

export const DOMAIN_C_PREFIXES = [".tinkerman/", ".kiro/"] as const;

export const DOMAIN_B_PREFIXES = [
  "skills/",
  "commands/",
  "agents/",
  "rules/",
  "packs/",
  "templates/",
  "examples/",
  "hooks/",
  "locales/",
  "scripts/",
  "src/",
  "test/",
  ".github/",
  ".githooks/",
  ".codex/agents/",
  ".claude/agents/",
  ".claude/rules/",
  ".claude/commands/",
] as const;

export const DOMAIN_A_PREFIXES = ["docs/"] as const;

export function classify(path: string): Domain | "EXCLUDED" | "UNCLASSIFIED" {
  // R1.5: Check excluded prefixes first
  for (const prefix of EXCLUDED_PREFIXES) {
    if (path.startsWith(prefix)) return "EXCLUDED";
  }

  // R1.3: Domain C has highest priority
  for (const prefix of DOMAIN_C_PREFIXES) {
    if (path.startsWith(prefix)) return "C";
  }

  // Domain B
  for (const prefix of DOMAIN_B_PREFIXES) {
    if (path.startsWith(prefix)) return "B";
  }

  // Domain A
  for (const prefix of DOMAIN_A_PREFIXES) {
    if (path.startsWith(prefix)) return "A";
  }

  // R1.7: Domain D — root directory first level only (no "/" in path)
  if (!path.includes("/") && path.endsWith(".md")) {
    return "D";
  }

  // R1.4/R1.6: UNCLASSIFIED
  return "UNCLASSIFIED";
}
