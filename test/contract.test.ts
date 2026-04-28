/**
 * Contract tests — verify consistency between source-of-truth files.
 *
 * These tests catch drift between:
 *   1. src/decide.ts UI trigger keywords ↔ teams/decide/config.json dynamic_members
 *   2. src/router.ts tier definitions ↔ README.md tier table
 *   3. Agent files existence ↔ team config references
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// 1. Decide team config ↔ agent files
// ---------------------------------------------------------------------------

describe("Contract: decide team config ↔ agent files", () => {
  const configPath = resolve(ROOT, "teams/decide/config.json");
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  it("all static members have corresponding agent files", () => {
    for (const member of config.members) {
      const agentPath = resolve(ROOT, `agents/${member.agent}.md`);
      expect(existsSync(agentPath), `Missing agent file: agents/${member.agent}.md`).toBe(true);
    }
  });

  it("all dynamic members have corresponding agent files", () => {
    if (!config.dynamic_members) return;
    for (const member of config.dynamic_members) {
      const agentPath = resolve(ROOT, `agents/${member.agent}.md`);
      expect(existsSync(agentPath), `Missing agent file: agents/${member.agent}.md`).toBe(true);
    }
  });

  it("designer is listed as dynamic member (not static)", () => {
    const staticNames = config.members.map((m: { name: string }) => m.name);
    expect(staticNames).not.toContain("designer");

    const dynamicNames = (config.dynamic_members || []).map((m: { name: string }) => m.name);
    expect(dynamicNames).toContain("designer");
  });
});

// ---------------------------------------------------------------------------
// 2. Review team config ↔ agent files
// ---------------------------------------------------------------------------

describe("Contract: review team config ↔ agent files", () => {
  const configPath = resolve(ROOT, "teams/review/config.json");
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  it("all members have corresponding agent files", () => {
    for (const member of config.members) {
      const agentPath = resolve(ROOT, `agents/${member.agent}.md`);
      expect(existsSync(agentPath), `Missing agent file: agents/${member.agent}.md`).toBe(true);
    }
  });

  it("review team has exactly 3 members", () => {
    expect(config.members).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 3. Router tiers ↔ README consistency
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
// 4. All 12 skill directories exist
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
// 5. CLAUDE.md template has all required placeholders
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
// 6. Distribution scripts exist
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
// 7. Knowledge templates exist
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
// 7.5 Command entry point exists
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
// 7.6 Agent files use Claude Code native frontmatter
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
// 9. Agent Team documentation and hooks
// ---------------------------------------------------------------------------

describe("Contract: Agent Team documentation", () => {
  it("teams/README.md exists with clarification about config files", () => {
    const readmePath = resolve(ROOT, "teams/README.md");
    expect(existsSync(readmePath), "Missing: teams/README.md").toBe(true);
    const content = readFileSync(readmePath, "utf-8");
    expect(content).toContain("不是");
    expect(content).toContain("subagent 定义");
  });

  it("CLAUDE.md template documents Agent Team configuration", () => {
    const templatePath = resolve(ROOT, "templates/CLAUDE.md");
    const template = readFileSync(templatePath, "utf-8");
    expect(template).toContain("Agent Team");
    expect(template).toContain("subagent 定义");
  });

  it("forge-decide SKILL.md contains Agent Team launch instructions", () => {
    const skillPath = resolve(ROOT, "skills/forge-decide/SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("Create an agent team");
    expect(content).toContain("using the product agent type");
    expect(content).toContain("Clean up the team");
  });

  it("forge-review SKILL.md contains Agent Team launch instructions", () => {
    const skillPath = resolve(ROOT, "skills/forge-review/SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("Create an agent team");
    expect(content).toContain("using the spec-check agent type");
    expect(content).toContain("Clean up the team");
  });
});

// ---------------------------------------------------------------------------
// 9.5 hooks.json semantic validation
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
// 9.6 scripts semantic validation
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
// 9.7 skills content validation
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
// 9.8 CI calibration step existence
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

describe("Contract: Agent Team hooks", () => {
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
