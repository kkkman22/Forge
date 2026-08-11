/**
 * Phase 2 contract tests — verify CCBP Hardening Phase 2 artifacts.
 *
 * Covers: hooks `if:` filters, compact hooks, agent frontmatter,
 * dispatcher handlers, lazy-loaded rules, version gate, gitignore.
 */
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// 1. Hooks `if:` filters (Req 1)
// ---------------------------------------------------------------------------
describe("Contract: hooks if: filters", () => {
  const hooksPath = resolve(ROOT, "hooks/hooks.json");
  const hooks = JSON.parse(readFileSync(hooksPath, "utf-8"));

  it("hooks.json has at least 3 if: entries in PreToolUse", () => {
    const preToolUse = hooks.hooks?.PreToolUse ?? [];
    const ifEntries = preToolUse.filter((e: Record<string, unknown>) => "if" in e);
    expect(ifEntries.length).toBeGreaterThanOrEqual(2);
  });

  it("hooks.json has at least 2 if: entries in PostToolUse", () => {
    const postToolUse = hooks.hooks?.PostToolUse ?? [];
    const ifEntries = postToolUse.filter((e: Record<string, unknown>) => "if" in e);
    expect(ifEntries.length).toBeGreaterThanOrEqual(2);
  });

  it("if: patterns use permission-rule syntax", () => {
    const allEntries = [...(hooks.hooks?.PreToolUse ?? []), ...(hooks.hooks?.PostToolUse ?? [])];
    const ifEntries = allEntries.filter((e: Record<string, unknown>) => "if" in e);
    for (const entry of ifEntries) {
      const ifVal = entry.if as string;
      expect(ifVal).toMatch(/^(Write|Edit|Bash)\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. PreCompact / PostCompact hooks (Req 2)
// ---------------------------------------------------------------------------
describe("Contract: compaction hooks", () => {
  it("scripts/hook-precompact.sh exists and is executable", () => {
    const path = resolve(ROOT, "scripts/hook-precompact.sh");
    expect(existsSync(path)).toBe(true);
    accessSync(path, constants.X_OK);
  });

  it("scripts/hook-postcompact.sh exists and is executable", () => {
    const path = resolve(ROOT, "scripts/hook-postcompact.sh");
    expect(existsSync(path)).toBe(true);
    accessSync(path, constants.X_OK);
  });

  it("hooks.json registers PreCompact and PostCompact events", () => {
    const hooksPath = resolve(ROOT, "hooks/hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf-8"));
    expect(hooks.hooks?.PreCompact).toBeDefined();
    expect(hooks.hooks?.PostCompact).toBeDefined();
  });

  it("plugin.json registers PreCompact and PostCompact with .sh scripts", () => {
    const hooksPath = resolve(ROOT, "hooks", "hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf-8"));
    expect(hooks.hooks?.PreCompact).toBeDefined();
    expect(hooks.hooks?.PostCompact).toBeDefined();
    const preCmd = JSON.stringify(hooks.hooks.PreCompact);
    const postCmd = JSON.stringify(hooks.hooks.PostCompact);
    expect(preCmd).toContain("hook-precompact.sh");
    expect(postCmd).toContain("hook-postcompact.sh");
  });

  it("precompact hook never exits 2", () => {
    const content = readFileSync(resolve(ROOT, "scripts/hook-precompact.sh"), "utf-8");
    expect(content).not.toMatch(/\bexit\s+2\b/);
    expect(content).not.toMatch(/\breturn\s+2\b/);
  });

  it(".gitignore contains .tinkerman/.compact-snapshot.md", () => {
    const gitignore = readFileSync(resolve(ROOT, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".tinkerman/.compact-snapshot.md");
  });
});

// ---------------------------------------------------------------------------
// 3. Agent frontmatter (Req 3, 4, 5)
// ---------------------------------------------------------------------------
describe("Contract: agent frontmatter", () => {
  it("forge-build.md has hooks: and isolation: worktree", () => {
    const content = readFileSync(resolve(ROOT, ".claude/agents/forge-build.md"), "utf-8");
    expect(content).toMatch(/^isolation:\s*"?worktree"?$/m);
    expect(content).toMatch(/^hooks:/m);
  });

  it("forge-ship.md has hooks: frontmatter", () => {
    const content = readFileSync(resolve(ROOT, ".claude/agents/forge-ship.md"), "utf-8");
    expect(content).toMatch(/^hooks:/m);
  });

  it("forge-plan.md has initialPrompt (50-500 chars)", () => {
    const content = readFileSync(resolve(ROOT, ".claude/agents/forge-plan.md"), "utf-8");
    expect(content).toMatch(/^initialPrompt:/m);
    const match = content.match(/^initialPrompt:\s*\|[\s\S]*?^(\S.*?)$/m);
    if (match) {
      const promptLength = content.split("initialPrompt:")[1].split("---")[0].trim().length;
      expect(promptLength).toBeGreaterThanOrEqual(50);
      expect(promptLength).toBeLessThanOrEqual(500);
    }
  });

  it("forge-build Stop hook has ci_cmd allowlist", () => {
    const content = readFileSync(resolve(ROOT, ".claude/agents/forge-build.md"), "utf-8");
    expect(content).toMatch(/ALLOWED_COMMANDS/);
  });

  it("only forge-build has isolation: worktree", () => {
    const agents = ["forge-plan", "forge-review", "forge-ship"];
    for (const agent of agents) {
      const path = resolve(ROOT, `.claude/agents/${agent}.md`);
      if (existsSync(path)) {
        const content = readFileSync(path, "utf-8");
        expect(content).not.toMatch(/^isolation:/m);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Dispatcher (Req 6)
// ---------------------------------------------------------------------------
describe("Contract: dispatcher", () => {
  it("dispatcher.sh exists and is executable", () => {
    const path = resolve(ROOT, ".claude/hooks/scripts/dispatcher.sh");
    expect(existsSync(path)).toBe(true);
    accessSync(path, constants.X_OK);
  });

  it("dispatcher.sh has all 6 handle_* functions", () => {
    const content = readFileSync(resolve(ROOT, ".claude/hooks/scripts/dispatcher.sh"), "utf-8");
    const handlers = [
      "handle_session_start",
      "handle_user_prompt_submit",
      "handle_pretool",
      "handle_posttool",
      "handle_stop",
      "handle_teammate_idle",
    ];
    for (const h of handlers) {
      expect(content).toMatch(new RegExp(`^${h}\\s*\\(\\)`, "m"));
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Rules (Req 7)
// ---------------------------------------------------------------------------
describe("Contract: lazy-loaded rules", () => {
  const rulesDir = resolve(ROOT, ".claude/rules");

  it("forge-src.md exists with valid paths:", () => {
    const path = resolve(rulesDir, "forge-src.md");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/^paths:/m);
    expect(content).not.toMatch(/^\s*-\s*["']?\*\*\/\*["']?$/m);
  });

  it("skill-editing.md exists with valid paths:", () => {
    const path = resolve(rulesDir, "skill-editing.md");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/^paths:/m);
  });

  it("branch-protection.md exists with valid paths:", () => {
    const path = resolve(rulesDir, "branch-protection.md");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/^paths:/m);
  });

  it("all rule files have non-empty bodies (≥5 lines after frontmatter)", () => {
    const files = ["forge-src.md", "skill-editing.md", "branch-protection.md"];
    for (const file of files) {
      const content = readFileSync(resolve(rulesDir, file), "utf-8");
      const afterFrontmatter = content.split("---").slice(2).join("---").trim();
      expect(afterFrontmatter.split("\n").length).toBeGreaterThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. CC Version Gate (Req 9)
// ---------------------------------------------------------------------------
describe("Contract: CC version gate", () => {
  it("init.sh contains check_cc_version function", () => {
    const content = readFileSync(resolve(ROOT, "scripts/init.sh"), "utf-8");
    expect(content).toMatch(/check_cc_version/);
    expect(content).toMatch(/2\.1\.121/);
    expect(content).toMatch(/sort -V/);
  });

  it("README mentions minimum CC version 2.1.163", () => {
    const content = readFileSync(resolve(ROOT, "README.md"), "utf-8");
    expect(content).toMatch(/2\.1\.163/);
  });

  it("CHANGELOG has Phase 2 entry", () => {
    const content = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf-8");
    expect(content).toMatch(/Phase 2/);
  });
});
