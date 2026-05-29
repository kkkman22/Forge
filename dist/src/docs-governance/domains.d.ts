import type { Domain } from "./types.js";
export declare const EXCLUDED_PREFIXES: readonly ["apps/", "dist/", "dist-plugin/", "node_modules/", ".git/", "test-results/", "apps/forge-loop-desktop/src-tauri/target/", ".claude/worktrees/", "api/"];
export declare const DOMAIN_C_PREFIXES: readonly [".forge/", ".kiro/"];
export declare const DOMAIN_B_PREFIXES: readonly ["skills/", "commands/", "agents/", "rules/", "packs/", "templates/", "examples/", "hooks/", "locales/", "scripts/", "src/", "test/", ".github/", ".githooks/", ".codex/agents/", ".claude/agents/", ".claude/rules/", ".claude/commands/"];
export declare const DOMAIN_A_PREFIXES: readonly ["docs/"];
export declare function classify(path: string): Domain | "EXCLUDED" | "UNCLASSIFIED";
