/**
 * Contract tests — verify consistency between source-of-truth files.
 *
 * These tests catch drift between:
 *   1. src/router.ts tier definitions ↔ README.md tier table
 *   2. Agent files existence ↔ skill definitions
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// 1. Router tiers ↔ README consistency
// ---------------------------------------------------------------------------

describe("Contract: router tiers ↔ README", () => {
  const readmePath = resolve(ROOT, "README.md");
  const readme = readFileSync(readmePath, "utf-8");

  it("README documents all three tiers", () => {
    expect(readme).toContain("轻量路径");
    expect(readme).toContain("标准路径");
    expect(readme).toContain("全量路径");
  });

  it("README light path matches router: build → review", () => {
    expect(readme).toContain("build → review");
  });

  it("README standard path matches router: plan → build → review → test → ship", () => {
    expect(readme).toContain("plan → build → review → test → ship");
  });

  it("README full path matches router: decide → spec → plan → build → review → test → ship → learn", () => {
    expect(readme).toContain("decide → spec → plan → build → review → test → ship → learn");
  });
});

// ---------------------------------------------------------------------------
// 2. All 12 skill directories exist
// ---------------------------------------------------------------------------

describe("Contract: all 12 skill directories exist", () => {
  const expectedSkills = [
    "forge-router",
    "forge-decide",
    "forge-spec",
    "forge-plan",
    "forge-build",
    "forge-review",
    "forge-test",
    "forge-ship",
    "forge-learn",
    "forge-debug",
    "forge-status",
    "forge-resume",
    "forge-abort",
  ];

  for (const skill of expectedSkills) {
    it(`skills/${skill}/SKILL.md exists`, () => {
      const skillPath = resolve(ROOT, `skills/${skill}/SKILL.md`);
      expect(existsSync(skillPath), `Missing: skills/${skill}/SKILL.md`).toBe(true);
    });
  }

  for (const skill of expectedSkills) {
    it(`skills/${skill}/SKILL.md has YAML frontmatter with name field`, () => {
      const content = readFileSync(resolve(ROOT, `skills/${skill}/SKILL.md`), "utf-8");
      expect(content.startsWith("---\n"), `${skill} SKILL.md missing frontmatter`).toBe(true);
      expect(content).toContain(`name: ${skill}`);
    });
  }

  it("only forge-router allows model invocation (others have disable-model-invocation: true)", () => {
    for (const skill of expectedSkills) {
      const content = readFileSync(resolve(ROOT, `skills/${skill}/SKILL.md`), "utf-8");
      if (skill === "forge-router") {
        expect(content).not.toContain("disable-model-invocation: true");
      } else {
        expect(content).toContain("disable-model-invocation: true");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. CLAUDE.md template has all required placeholders
// ---------------------------------------------------------------------------

describe("Contract: CLAUDE.md template placeholders", () => {
  const templatePath = resolve(ROOT, "templates/CLAUDE.md");
  const template = readFileSync(templatePath, "utf-8");

  const requiredPlaceholders = [
    "{{project_name}}",
    "{{tech_stack}}",
    "{{security_level}}",
    "{{knowledge_limit}}",
    "{{init_date}}",
  ];

  for (const placeholder of requiredPlaceholders) {
    it(`template contains ${placeholder}`, () => {
      expect(template).toContain(placeholder);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Distribution scripts exist
// ---------------------------------------------------------------------------

describe("Contract: distribution scripts exist", () => {
  const requiredScripts = [
    "scripts/init.sh",
    "scripts/build-dist.sh",
    "scripts/install-dist.sh",
    "scripts/validate-knowledge.sh",
  ];

  for (const script of requiredScripts) {
    it(`${script} exists`, () => {
      const scriptPath = resolve(ROOT, script);
      expect(existsSync(scriptPath), `Missing: ${script}`).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Knowledge templates exist
// ---------------------------------------------------------------------------

describe("Contract: knowledge templates exist", () => {
  const requiredTemplates = ["templates/known-failures.md", "templates/session-journal.md"];

  for (const tmpl of requiredTemplates) {
    it(`${tmpl} exists`, () => {
      const tmplPath = resolve(ROOT, tmpl);
      expect(existsSync(tmplPath), `Missing: ${tmpl}`).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Command entry point exists
// ---------------------------------------------------------------------------

describe("Contract: forge command entry point", () => {
  it("commands/forge.md exists", () => {
    const cmdPath = resolve(ROOT, "commands/forge.md");
    expect(existsSync(cmdPath), "Missing: commands/forge.md").toBe(true);
  });

  it("commands/forge.md has name frontmatter", () => {
    const content = readFileSync(resolve(ROOT, "commands/forge.md"), "utf-8");
    expect(content).toContain("name: forge");
  });
});

// ---------------------------------------------------------------------------
// 7. Agent files use Claude Code native frontmatter
// ---------------------------------------------------------------------------

describe("Contract: agent files use Claude Code native frontmatter", () => {
  const agentFiles = [
    "agents/product.md",
    "agents/architect.md",
    "agents/security.md",
    "agents/designer.md",
    "agents/spec-check.md",
    "agents/quality-check.md",
    "agents/security-check.md",
  ];

  for (const agentFile of agentFiles) {
    it(`${agentFile} has 'name' frontmatter (Claude Code native)`, () => {
      const content = readFileSync(resolve(ROOT, agentFile), "utf-8");
      expect(content).toContain("name:");
    });

    it(`${agentFile} has 'model' frontmatter`, () => {
      const content = readFileSync(resolve(ROOT, agentFile), "utf-8");
      expect(content).toContain("model:");
    });

    it(`${agentFile} has 'maxTurns' frontmatter`, () => {
      const content = readFileSync(resolve(ROOT, agentFile), "utf-8");
      expect(content).toContain("maxTurns:");
    });

    it(`${agentFile} has 'tools' frontmatter`, () => {
      const content = readFileSync(resolve(ROOT, agentFile), "utf-8");
      expect(content).toContain("tools:");
    });

    it(`${agentFile} has 'permissionMode' frontmatter`, () => {
      const content = readFileSync(resolve(ROOT, agentFile), "utf-8");
      expect(content).toContain("permissionMode:");
    });

    it(`${agentFile} does NOT use legacy 'role' frontmatter`, () => {
      const content = readFileSync(resolve(ROOT, agentFile), "utf-8");
      // Check frontmatter section only (between first two ---)
      const frontmatter = content.split("---")[1] || "";
      expect(frontmatter).not.toMatch(/^role:/m);
    });
  }

  it("review agents have memory: project", () => {
    const reviewAgents = [
      "agents/spec-check.md",
      "agents/quality-check.md",
      "agents/security-check.md",
    ];
    for (const agentFile of reviewAgents) {
      const content = readFileSync(resolve(ROOT, agentFile), "utf-8");
      expect(content, `${agentFile} should have memory: project`).toContain("memory: project");
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Dist bundles contain all skills (post build-dist)
// ---------------------------------------------------------------------------

describe("Contract: dist bundle completeness (if built)", () => {
  const platforms = ["claude-code"];
  const expectedSkillDirs = [
    "forge-router",
    "forge-decide",
    "forge-spec",
    "forge-plan",
    "forge-build",
    "forge-review",
    "forge-test",
    "forge-ship",
    "forge-learn",
    "forge-debug",
    "forge-status",
    "forge-resume",
    "forge-abort",
  ];

  for (const platform of platforms) {
    const bundleRoot = resolve(ROOT, `dist/${platform}/bundles/forge`);
    const bundleExists = existsSync(bundleRoot);

    if (bundleExists) {
      for (const skill of expectedSkillDirs) {
        it(`dist/${platform} contains skills/${skill}/SKILL.md`, () => {
          const skillPath = resolve(bundleRoot, `skills/${skill}/SKILL.md`);
          expect(
            existsSync(skillPath),
            `Missing in ${platform} bundle: skills/${skill}/SKILL.md`,
          ).toBe(true);
        });
      }

      it(`dist/${platform} contains VERSION file`, () => {
        const versionPath = resolve(bundleRoot, "VERSION");
        expect(existsSync(versionPath), `Missing in ${platform} bundle: VERSION`).toBe(true);
      });

      it(`dist/${platform} contains INSTALL.md`, () => {
        const installPath = resolve(bundleRoot, "INSTALL.md");
        expect(existsSync(installPath), `Missing in ${platform} bundle: INSTALL.md`).toBe(true);
      });
    } else {
      it(`dist/${platform} bundle not built (skipped)`, () => {
        // This test passes when dist is not built — it's only enforced in CI after build-dist
        expect(true).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 9. hooks.json semantic validation
// ---------------------------------------------------------------------------

describe("Contract: hooks.json semantic validation", () => {
  const hooksPath = resolve(ROOT, "hooks/hooks.json");
  const hooksFile = JSON.parse(readFileSync(hooksPath, "utf-8"));
  const hooksMap = hooksFile.hooks as Record<
    string,
    Array<{ matcher?: string; hooks: Array<{ type: string; command?: string; timeout?: unknown }> }>
  >;

  const VALID_HOOK_EVENTS = new Set([
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "TeammateIdle",
    "TaskCompleted",
  ]);

  const VALID_TOOL_NAMES = new Set([
    "Write",
    "Edit",
    "Bash",
    "Read",
    "Grep",
    "Glob",
    "LS",
    "WebSearch",
    "WebFetch",
  ]);

  // Requirement 4.7: Event names match the valid set
  it("all event names are valid Claude Code hook events", () => {
    for (const eventName of Object.keys(hooksMap)) {
      expect(
        VALID_HOOK_EVENTS.has(eventName),
        `Invalid hook event name: "${eventName}". Valid events: ${[...VALID_HOOK_EVENTS].join(", ")}`,
      ).toBe(true);
    }
  });

  // Requirement 4.1: Command file references exist or use fallback patterns
  it("every command references existing files or uses a fallback pattern", () => {
    const fallbackPatterns = ["|| true", "2>/dev/null", "|| bash"];

    for (const [eventName, matcherGroups] of Object.entries(hooksMap)) {
      for (const group of matcherGroups) {
        for (const handler of group.hooks) {
          if (!handler.command) continue;

          const command = handler.command;
          const hasFallback = fallbackPatterns.some((pattern) => command.includes(pattern));

          // Extract file paths referenced in the command (e.g. forge/scripts/auto-resume.sh, .forge/status.md)
          // Look for paths like word/word/word.ext or .word/word.ext
          const fileRefs = command.match(/(?:[\w.-]+\/)+[\w.*-]+\.\w+/g) || [];

          // Filter to actual file references (not glob patterns with *)
          const concreteFileRefs = fileRefs.filter(
            (ref) =>
              !ref.includes("*") &&
              !ref.startsWith("$") &&
              !ref.startsWith("~") &&
              !ref.includes("stash@"),
          );

          if (concreteFileRefs.length === 0) continue; // No file references to check

          // If the command has a fallback, it's acceptable even if files don't exist locally
          if (hasFallback) continue;

          // Without a fallback, at least one referenced file should exist
          // Commands may reference files conditionally (e.g. `if [ -f .forge/status.md ]`)
          const hasConditionalCheck = command.includes("if [") || command.includes("[ -f");
          if (hasConditionalCheck) continue;

          for (const ref of concreteFileRefs) {
            const filePath = resolve(ROOT, ref);
            expect(
              existsSync(filePath),
              `${eventName} hook command references non-existent file "${ref}" without a fallback pattern. Command: ${command}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  // Requirement 4.2: PreToolUse/PostToolUse matchers use valid tool names
  it("every matcher field contains only valid Claude Code tool names", () => {
    for (const [eventName, matcherGroups] of Object.entries(hooksMap)) {
      for (const group of matcherGroups) {
        if (!group.matcher) continue;

        const toolNames = group.matcher.split("|");
        for (const toolName of toolNames) {
          expect(
            VALID_TOOL_NAMES.has(toolName),
            `${eventName} has invalid tool name "${toolName}" in matcher "${group.matcher}". Valid tools: ${[...VALID_TOOL_NAMES].join(", ")}`,
          ).toBe(true);
        }
      }
    }
  });

  // Requirement 4.3: Timeout fields are positive integers
  it("every timeout field is a positive integer", () => {
    for (const [eventName, matcherGroups] of Object.entries(hooksMap)) {
      for (const group of matcherGroups) {
        for (const handler of group.hooks) {
          if (handler.timeout === undefined) continue;

          expect(
            typeof handler.timeout === "number" &&
              Number.isInteger(handler.timeout) &&
              handler.timeout > 0,
            `${eventName} hook has invalid timeout: ${JSON.stringify(handler.timeout)} (must be a positive integer)`,
          ).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 10. scripts semantic validation
// ---------------------------------------------------------------------------

describe("Contract: scripts semantic validation", () => {
  const scriptsDir = resolve(ROOT, "scripts");
  const scriptFiles = readdirSync(scriptsDir)
    .filter((f) => f.endsWith(".sh"))
    .map((f) => resolve(scriptsDir, f));

  // Requirement 4.4: Valid shebang line
  for (const scriptPath of scriptFiles) {
    const name = scriptPath.replace(`${ROOT}/`, "");
    it(`${name} starts with a valid shebang line`, () => {
      const content = readFileSync(scriptPath, "utf-8");
      const firstLine = content.split("\n")[0];
      const validShebangs = ["#!/bin/bash", "#!/usr/bin/env bash"];
      expect(
        validShebangs.includes(firstLine),
        `${name} has invalid shebang: "${firstLine}". Expected one of: ${validShebangs.join(", ")}`,
      ).toBe(true);
    });
  }

  // Requirement 4.5: Executable permission bit
  for (const scriptPath of scriptFiles) {
    const name = scriptPath.replace(`${ROOT}/`, "");
    it(`${name} has the execute permission bit set`, () => {
      const mode = statSync(scriptPath).mode;
      expect(
        (mode & 0o111) !== 0,
        `${name} is not executable (mode: ${mode.toString(8)}). Run: chmod +x ${name}`,
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 11. skills content validation
// ---------------------------------------------------------------------------

describe("Contract: skills content validation", () => {
  const skillsDir = resolve(ROOT, "skills");
  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const skillMdFiles = skillDirs
    .map((dir) => ({ dir, path: resolve(skillsDir, dir, "SKILL.md") }))
    .filter(({ path: p }) => existsSync(p));

  // Requirement 4.6: Each SKILL.md has an Instructions heading (or equivalent) after frontmatter
  for (const { dir, path: skillPath } of skillMdFiles) {
    it(`skills/${dir}/SKILL.md contains an Instructions heading (or equivalent) after frontmatter`, () => {
      const content = readFileSync(skillPath, "utf-8");

      // Strip YAML frontmatter (between --- markers)
      const frontmatterEnd = content.indexOf("---", content.indexOf("---") + 3);
      expect(
        frontmatterEnd,
        `skills/${dir}/SKILL.md has no closing frontmatter delimiter`,
      ).toBeGreaterThan(0);
      const bodyContent = content.slice(frontmatterEnd + 3);

      // Match ## Instructions, ## 指令, or any numbered ## heading (e.g. ## 1. 概述)
      // This confirms the file has substantive content beyond metadata
      const instructionsPattern = /^##\s+(Instructions|指令|\d+[.\s])/m;
      expect(
        instructionsPattern.test(bodyContent),
        `skills/${dir}/SKILL.md has no Instructions heading (or equivalent numbered section) after frontmatter`,
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 12. CI calibration step existence
// ---------------------------------------------------------------------------

describe("Contract: CI calibration step existence", () => {
  const ciPath = resolve(ROOT, ".github/workflows/ci.yml");

  it("ci.yml contains a step referencing check-readme-metrics.sh", () => {
    const content = readFileSync(ciPath, "utf-8");
    expect(
      content.includes("check-readme-metrics.sh"),
      "CI workflow (.github/workflows/ci.yml) does not contain a step referencing check-readme-metrics.sh",
    ).toBe(true);
  });
});

describe("Contract: hooks.json structure validation", () => {
  const hooksPath = resolve(ROOT, "hooks/hooks.json");
  const hooks = JSON.parse(readFileSync(hooksPath, "utf-8"));

  it("hooks.json contains TeammateIdle hook", () => {
    expect(hooks.hooks.TeammateIdle).toBeDefined();
    expect(hooks.hooks.TeammateIdle.length).toBeGreaterThan(0);
  });

  it("hooks.json contains TaskCompleted hook", () => {
    expect(hooks.hooks.TaskCompleted).toBeDefined();
    expect(hooks.hooks.TaskCompleted.length).toBeGreaterThan(0);
  });

  it("all hook entries use the official nested hooks array structure", () => {
    for (const [eventName, matcherGroups] of Object.entries(hooks.hooks)) {
      for (const group of matcherGroups as Array<{ hooks?: unknown[] }>) {
        expect(group.hooks, `${eventName} hook entry missing nested 'hooks' array`).toBeDefined();
        expect(Array.isArray(group.hooks)).toBe(true);
        for (const handler of group.hooks as Array<{ type?: string }>) {
          expect(handler.type, `${eventName} hook handler missing 'type' field`).toBeDefined();
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 13. Evolved rules templates
// ---------------------------------------------------------------------------

describe("Contract: evolved rules templates", () => {
  it("templates/evolved-rules.md exists", () => {
    const tmplPath = resolve(ROOT, "templates/evolved-rules.md");
    expect(existsSync(tmplPath), "Missing: templates/evolved-rules.md").toBe(true);
  });

  it("templates/rule-changelog.md exists", () => {
    const tmplPath = resolve(ROOT, "templates/rule-changelog.md");
    expect(existsSync(tmplPath), "Missing: templates/rule-changelog.md").toBe(true);
  });

  it("evolved-rules.md template contains YAML frontmatter with updated, rule_count, max_rules fields", () => {
    const content = readFileSync(resolve(ROOT, "templates/evolved-rules.md"), "utf-8");
    expect(content).toContain("updated:");
    expect(content).toContain("rule_count:");
    expect(content).toContain("max_rules:");
  });

  it("rule-changelog.md template contains YAML frontmatter with updated field", () => {
    const content = readFileSync(resolve(ROOT, "templates/rule-changelog.md"), "utf-8");
    expect(content).toContain("updated:");
  });
});

// ---------------------------------------------------------------------------
// 14. CLAUDE.md self-evolution section
// ---------------------------------------------------------------------------

describe("Contract: CLAUDE.md self-evolution section", () => {
  const templatePath = resolve(ROOT, "templates/CLAUDE.md");
  const template = readFileSync(templatePath, "utf-8");

  it("CLAUDE.md template contains a Self-Evolution heading (Section 5)", () => {
    expect(template).toMatch(/##\s+5\.\s+Self-Evolution/);
  });

  it("Section references evolved-rules.md", () => {
    expect(template).toContain("evolved-rules.md");
  });

  it("Section documents the five knowledge categories", () => {
    expect(template).toContain("Categories");
    expect(template).toContain("instincts");
  });

  it("Section documents the 15-rule cap", () => {
    expect(template).toContain("15-rule cap");
  });

  it("Section documents exclusions", () => {
    expect(template).toContain("Exclusions");
    expect(template).toContain("Architecture descriptions");
  });
});

// ---------------------------------------------------------------------------
// 15. hooks.json evolved rules integration
// ---------------------------------------------------------------------------

describe("Contract: hooks.json evolved rules integration", () => {
  const hooksPath = resolve(ROOT, "hooks/hooks.json");
  const hooksFile = JSON.parse(readFileSync(hooksPath, "utf-8"));

  it("SessionStart contains a hook entry referencing evolved-rules.md", () => {
    const sessionStartGroups = hooksFile.hooks.SessionStart as Array<{
      hooks: Array<{ command?: string }>;
    }>;
    const hasEvolvedRulesHook = sessionStartGroups.some((group) =>
      group.hooks.some((h) => h.command?.includes("evolved-rules.md")),
    );
    expect(hasEvolvedRulesHook, "SessionStart missing hook referencing evolved-rules.md").toBe(
      true,
    );
  });

  it("SessionStart evolved-rules hook uses conditional if [ -f check", () => {
    const sessionStartGroups = hooksFile.hooks.SessionStart as Array<{
      hooks: Array<{ command?: string }>;
    }>;
    const evolvedRulesHook = sessionStartGroups
      .flatMap((group) => group.hooks)
      .find((h) => h.command?.includes("evolved-rules.md"));
    expect(evolvedRulesHook?.command).toContain("if [ -f");
  });

  it("SessionStart evolved-rules hook has a positive integer timeout", () => {
    const sessionStartGroups = hooksFile.hooks.SessionStart as Array<{
      hooks: Array<{ command?: string; timeout?: unknown }>;
    }>;
    const evolvedRulesGroup = sessionStartGroups.find((group) =>
      group.hooks.some((h) => h.command?.includes("evolved-rules.md")),
    );
    const evolvedRulesHandler = evolvedRulesGroup?.hooks.find((h) =>
      h.command?.includes("evolved-rules.md"),
    );
    expect(evolvedRulesHandler?.timeout).toBeDefined();
    expect(
      typeof evolvedRulesHandler?.timeout === "number" &&
        Number.isInteger(evolvedRulesHandler.timeout) &&
        evolvedRulesHandler.timeout > 0,
      `Timeout must be a positive integer, got: ${evolvedRulesHandler?.timeout}`,
    ).toBe(true);
  });

  it("Stop contains a hook entry for pending proposals", () => {
    const stopGroups = hooksFile.hooks.Stop as Array<{
      hooks: Array<{ command?: string }>;
    }>;
    const hasPendingProposalsHook = stopGroups.some((group) =>
      group.hooks.some(
        (h) => h.command?.includes("PENDING") || h.command?.includes("evolved-rules.md"),
      ),
    );
    expect(hasPendingProposalsHook, "Stop missing hook for pending proposals").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 16. config.md evolved rules protection
// ---------------------------------------------------------------------------

describe("Contract: config.md evolved rules protection", () => {
  const configPath = resolve(ROOT, "templates/config.md");
  const config = readFileSync(configPath, "utf-8");

  it("config.md template lists evolved-rules.md in the Guarded zone section", () => {
    // Verify evolved-rules.md appears in the Guarded zone (受保护区)
    const guardedStart = config.indexOf("受保护区（Guarded）");
    const openStart = config.indexOf("开放区（Open）");
    expect(guardedStart, "config.md missing Guarded zone section").toBeGreaterThan(-1);
    expect(openStart, "config.md missing Open zone section").toBeGreaterThan(-1);
    const guardedSection = config.slice(guardedStart, openStart);
    expect(
      guardedSection.includes("evolved-rules.md"),
      "evolved-rules.md not listed in Guarded zone",
    ).toBe(true);
  });

  it("config.md template lists rule-changelog.md in the Guarded zone section", () => {
    const guardedStart = config.indexOf("受保护区（Guarded）");
    const openStart = config.indexOf("开放区（Open）");
    const guardedSection = config.slice(guardedStart, openStart);
    expect(
      guardedSection.includes("rule-changelog.md"),
      "rule-changelog.md not listed in Guarded zone",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 17. forge-learn SKILL.md rule distillation
// ---------------------------------------------------------------------------

describe("Contract: forge-learn SKILL.md rule distillation", () => {
  const skillPath = resolve(ROOT, "skills/forge-learn/SKILL.md");
  const content = readFileSync(skillPath, "utf-8");

  it("SKILL.md contains a Rule Distillation or equivalent heading", () => {
    expect(
      content.match(/Rule Distillation|规则蒸馏/),
      "SKILL.md missing Rule Distillation heading",
    ).not.toBeNull();
  });

  it("SKILL.md references all four data sources", () => {
    expect(content).toContain("known-failures");
    expect(content).toContain("instincts");
    expect(content).toContain("skill-feedback");
    expect(content).toContain("metrics");
  });

  it("SKILL.md documents all five threshold conditions", () => {
    // known-failures: occurrence >= 3
    expect(content).toMatch(/occurrence\s*>=\s*3/);
    // instincts: confidence >= 0.8
    expect(content).toMatch(/confidence\s*>=\s*0\.8/);
    // skill-feedback: frequency >= 3
    expect(content).toMatch(/frequency\s*>=\s*3/);
    // session journals: 3+ sessions
    expect(content).toMatch(/3\+?\s*会话|3\+?\s*session/i);
    // metrics: 3+ session degradation
    expect(content).toMatch(/3\+?\s*session|连续\s*3/i);
  });
});

// ---------------------------------------------------------------------------
// 17. CLAUDE.md ↔ templates/CLAUDE.md sync
// ---------------------------------------------------------------------------

describe("Contract: CLAUDE.md and template sync", () => {
  const claudePath = resolve(ROOT, "CLAUDE.md");
  const templatePath = resolve(ROOT, "templates", "CLAUDE.md");
  const claude = readFileSync(claudePath, "utf-8");
  const template = readFileSync(templatePath, "utf-8");

  it("both files have same line count (±2 lines)", () => {
    const claudeLines = claude.split("\n").length;
    const templateLines = template.split("\n").length;
    expect(Math.abs(claudeLines - templateLines)).toBeLessThanOrEqual(2);
  });

  it("template has all 5 required placeholders", () => {
    expect(template).toContain("{{project_name}}");
    expect(template).toContain("{{tech_stack}}");
    expect(template).toContain("{{security_level}}");
    expect(template).toContain("{{knowledge_limit}}");
    expect(template).toContain("{{init_date}}");
  });

  it("CLAUDE.md does not contain any template placeholders", () => {
    expect(claude).not.toContain("{{project_name}}");
    expect(claude).not.toContain("{{tech_stack}}");
    expect(claude).not.toContain("{{security_level}}");
    expect(claude).not.toContain("{{knowledge_limit}}");
    expect(claude).not.toContain("{{init_date}}");
  });
});

// ---------------------------------------------------------------------------
// 18. CLAUDE.md reference pointers resolve to detail doc
// ---------------------------------------------------------------------------

describe("Contract: CLAUDE.md reference pointers resolve", () => {
  const claude = readFileSync(resolve(ROOT, "CLAUDE.md"), "utf-8");
  const detail = readFileSync(resolve(ROOT, "docs", "forge-constitution-detail.md"), "utf-8");

  it("detail doc exists and is non-empty", () => {
    expect(detail.length).toBeGreaterThan(100);
  });

  it("each section referenced in CLAUDE.md exists in detail doc", () => {
    const refs = claude.match(/→ 详见 docs\/forge-constitution-detail\.md §[\d.]+/g);
    expect(refs).not.toBeNull();
    if (!refs) return;
    const sections = [...new Set(refs)].map((r) =>
      r.replace(/→ 详见 docs\/forge-constitution-detail\.md /, ""),
    );
    for (const section of sections) {
      const sectionNum = section.replace("§", "");
      const majorSection = sectionNum.split(".")[0];
      expect(
        detail.includes(`## §${majorSection}`) ||
          detail.includes(`### §${sectionNum}`) ||
          detail.includes(`§${sectionNum}`),
        `Reference ${section} not found in detail doc`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 19. SKILL references/ structure
// ---------------------------------------------------------------------------

describe("Contract: SKILL references/ structure", () => {
  const skillsWithRefs: Record<string, string[]> = {
    "forge-build": [
      "tdd-rules.md",
      "closure-probes.md",
      "context-budget.md",
      "anti-drift.md",
      "function-contracts.md",
    ],
    "forge-review": [
      "confidence-filtering.md",
      "dedup-pipeline.md",
      "quality-gate.md",
      "function-contracts.md",
    ],
    "forge-plan": [
      "atomic-task-format.md",
      "lightweight-task-format.md",
      "prohibited-content.md",
      "function-contracts.md",
    ],
  };

  for (const [skill, expectedFiles] of Object.entries(skillsWithRefs)) {
    describe(`skills/${skill}/references/`, () => {
      for (const file of expectedFiles) {
        it(`${file} exists`, () => {
          const refPath = resolve(ROOT, "skills", skill, "references", file);
          expect(existsSync(refPath), `Missing: skills/${skill}/references/${file}`).toBe(true);
        });
      }
    });
  }

  it("all internal reference pointers in SKILL.md files point to existing files", () => {
    for (const skill of Object.keys(skillsWithRefs)) {
      const skillContent = readFileSync(resolve(ROOT, "skills", skill, "SKILL.md"), "utf-8");
      const refs = skillContent.match(/→ 详见 references\/[\w-]+\.md/g) || [];
      for (const ref of refs) {
        const fileName = ref.replace("→ 详见 references/", "");
        const refPath = resolve(ROOT, "skills", skill, "references", fileName);
        expect(
          existsSync(refPath),
          `Broken pointer in ${skill}/SKILL.md: references/${fileName}`,
        ).toBe(true);
      }
    }
  });

  it("cross-SKILL reference pointers resolve to existing files", () => {
    const crossRefPattern = /\.\.\/forge-build\/references\/[\w-]+\.md/g;
    const skillsDir = resolve(ROOT, "skills");

    for (const dir of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const skillPath = resolve(skillsDir, dir.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;

      const content = readFileSync(skillPath, "utf-8");
      const refs = content.match(crossRefPattern) || [];
      for (const ref of refs) {
        const resolvedPath = resolve(skillsDir, dir.name, ref);
        expect(
          existsSync(resolvedPath),
          `Broken cross-SKILL ref in ${dir.name}/SKILL.md: ${ref}`,
        ).toBe(true);
      }
    }
  });
});
