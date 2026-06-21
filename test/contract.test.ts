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
// 2. All skill instructions exist in collapsed lib structure
// ---------------------------------------------------------------------------

describe("Contract: all skill instructions exist in collapsed lib", () => {
  const expectedSkills = [
    "router",
    "decide",
    "spec",
    "plan",
    "build",
    "review",
    "test",
    "ship",
    "learn",
    "debug",
    "status",
    "resume",
    "abort",
  ];

  for (const skill of expectedSkills) {
    it(`skills/forge/lib/${skill}/instructions.md exists`, () => {
      const skillPath = resolve(ROOT, `skills/forge/lib/${skill}/instructions.md`);
      expect(existsSync(skillPath), `Missing: skills/forge/lib/${skill}/instructions.md`).toBe(
        true,
      );
    });
  }

  for (const skill of expectedSkills) {
    it(`skills/forge/lib/${skill}/instructions.md has YAML frontmatter`, () => {
      const content = readFileSync(
        resolve(ROOT, `skills/forge/lib/${skill}/instructions.md`),
        "utf-8",
      );
      expect(content.startsWith("---\n"), `${skill} instructions.md missing frontmatter`).toBe(
        true,
      );
    });
  }

  it("no skill has disable-model-invocation (collapsed mode, dispatcher handles it)", () => {
    for (const skill of expectedSkills) {
      const content = readFileSync(
        resolve(ROOT, `skills/forge/lib/${skill}/instructions.md`),
        "utf-8",
      );
      expect(content).not.toContain("disable-model-invocation: true");
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
  // After v2.5.0 (ADR-0004), 29 forge-* skills are collapsed into
  // skills/forge/lib/<sub>/instructions.md under a single registered forge skill.
  const expectedLibSubs = [
    "router",
    "decide",
    "spec",
    "plan",
    "build",
    "review",
    "test",
    "ship",
    "learn",
    "debug",
    "status",
    "resume",
    "abort",
  ];

  for (const platform of platforms) {
    const bundleRoot = resolve(ROOT, `dist/${platform}/bundles/forge`);
    // Only run bundle assertions when a full build-dist has been executed.
    // The dist/ directory may be partially committed to git (e.g. INSTALL.md
    // without skills/ or VERSION), which would cause false positives.  Use
    // VERSION as sentinel — it is generated exclusively by build-dist.sh.
    const bundleExists = existsSync(resolve(bundleRoot, "VERSION"));

    if (bundleExists) {
      it(`dist/${platform} contains skills/forge/SKILL.md (single entry)`, () => {
        const skillPath = resolve(bundleRoot, "skills/forge/SKILL.md");
        expect(existsSync(skillPath), `Missing in ${platform} bundle: skills/forge/SKILL.md`).toBe(
          true,
        );
      });

      for (const sub of expectedLibSubs) {
        it(`dist/${platform} contains skills/forge/lib/${sub}/instructions.md`, () => {
          const libPath = resolve(bundleRoot, `skills/forge/lib/${sub}/instructions.md`);
          expect(
            existsSync(libPath),
            `Missing in ${platform} bundle: skills/forge/lib/${sub}/instructions.md`,
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
// 9. quality-check deslop dimension [R2.4]
// ---------------------------------------------------------------------------

describe("Contract: quality-check deslop dimension", () => {
  const qualityCheckPath = resolve(ROOT, "agents/quality-check.md");

  it("quality-check contains Deslop dimension (dimension 7)", () => {
    const content = readFileSync(qualityCheckPath, "utf-8");
    expect(content).toContain("Deslop");
    expect(content).toContain("deslop: skipped");
  });

  it("quality-check output schema is unchanged (Severity/File:Line/Issue/Suggestion)", () => {
    const content = readFileSync(qualityCheckPath, "utf-8");
    // The four-column schema must still be the only output format [R2.4]
    expect(content).toContain("| # | Severity | File:Line | Issue | Suggestion |");
    // Verify the Output Format section still shows the standard 4 columns
    const outputFormatMatch = content.match(/## Output Format[\s\S]*?```markdown[\s\S]*?```/);
    expect(outputFormatMatch).toBeTruthy();
    expect(outputFormatMatch?.[0]).toContain("Severity");
    expect(outputFormatMatch?.[0]).toContain("File:Line");
    expect(outputFormatMatch?.[0]).toContain("Issue");
    expect(outputFormatMatch?.[0]).toContain("Suggestion");
  });
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
    "PreCompact",
    "PostCompact",
    "TaskCompleted",
    "TaskCreated",
    "ConfigChange",
    "WorktreeCreate",
    "WorktreeRemove",
    "StopFailure",
    "PermissionDenied",
  ]);

  const VALID_TOOL_NAMES = new Set([
    "Write",
    "Edit",
    "MultiEdit",
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
      const instructionsPattern = /^##\s+(Instructions|指令|概述|\d+[.\s])/m;
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

  const requiredLifecycleHooks = [
    ["ConfigChange", "scripts/config-changed-hook.mjs"],
    ["PermissionDenied", "scripts/permission-denied-hook.mjs"],
    ["WorktreeRemove", "scripts/worktree-remove-hook.mjs"],
  ] as const;

  for (const [eventName, scriptPath] of requiredLifecycleHooks) {
    it(`hooks.json contains ${eventName} lifecycle hook using args`, () => {
      const groups = hooks.hooks[eventName] as Array<{
        hooks?: Array<{ args?: string[]; command?: string }>;
      }>;

      expect(groups, `${eventName} hook is not registered`).toBeDefined();
      expect(groups.length, `${eventName} hook has no handlers`).toBeGreaterThan(0);

      const hasArgsHandler = groups.some((group) =>
        group.hooks?.some(
          (handler) => Array.isArray(handler.args) && handler.args.includes(scriptPath),
        ),
      );
      expect(hasArgsHandler, `${eventName} must reference ${scriptPath} via args`).toBe(true);
    });
  }

  it("all hook entries use the official nested hooks array structure", () => {
    for (const [eventName, matcherGroups] of Object.entries(hooks.hooks)) {
      for (const [gi, group] of (matcherGroups as Array<{ hooks?: unknown[] }>).entries()) {
        expect(group.hooks, `${eventName} hook entry missing nested 'hooks' array`).toBeDefined();
        expect(Array.isArray(group.hooks)).toBe(true);
        for (const [hi, handler] of (
          group.hooks as Array<{ type?: string; command?: string; args?: string[] }>
        ).entries()) {
          // Accept two formats: command string (type+command) or args[] exec form
          const isCommand = handler.type === "command" && typeof handler.command === "string";
          const isArgs = Array.isArray(handler.args) && handler.args.length > 0;
          expect(
            isCommand || isArgs,
            `${eventName} matcher group [${gi}] hook [${hi}] must have either {type:"command", command} or {args[]}`,
          ).toBe(true);
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

  it("CLAUDE.md template contains a Self-Evolution heading (Section 6)", () => {
    expect(template).toMatch(/##\s+6\.\s+Self-Evolution/);
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

  it("SessionStart contains a hook entry for evolved-rules injection", () => {
    const sessionStartGroups = hooksFile.hooks.SessionStart as Array<{
      hooks: Array<{ command?: string }>;
    }>;
    const hasEvolvedRulesHook = sessionStartGroups.some((group) =>
      group.hooks.some((h) => h.command?.includes("inject-evolved-rules")),
    );
    expect(hasEvolvedRulesHook, "SessionStart missing hook for evolved-rules injection").toBe(true);
  });

  it("SessionStart evolved-rules hook uses inject-evolved-rules.mjs script", () => {
    const sessionStartGroups = hooksFile.hooks.SessionStart as Array<{
      hooks: Array<{ command?: string }>;
    }>;
    const evolvedRulesHook = sessionStartGroups
      .flatMap((group) => group.hooks)
      .find((h) => h.command?.includes("inject-evolved-rules.mjs"));
    expect(evolvedRulesHook?.command).toContain("inject-evolved-rules.mjs");
  });

  it("SessionStart evolved-rules hook has a positive integer timeout", () => {
    const sessionStartGroups = hooksFile.hooks.SessionStart as Array<{
      hooks: Array<{ command?: string; timeout?: unknown }>;
    }>;
    const evolvedRulesGroup = sessionStartGroups.find((group) =>
      group.hooks.some((h) => h.command?.includes("evolved-rules")),
    );
    const evolvedRulesHandler = evolvedRulesGroup?.hooks.find((h) =>
      h.command?.includes("evolved-rules"),
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
        (h) =>
          h.command?.includes("stop-pending-rules.mjs") ||
          h.command?.includes("PENDING") ||
          h.command?.includes("evolved-rules.md"),
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
//
// Progressive Disclosure (skills-cross-pollination R5) moved the detailed
// threshold table out of the 150-line SKILL.md body into
// `references/rule-distillation.md`. The contract therefore reads the
// main SKILL body plus all reference files as a single logical surface.
// ---------------------------------------------------------------------------

describe("Contract: forge-learn SKILL.md rule distillation", () => {
  const skillDir = resolve(ROOT, "skills/forge/lib/learn");
  const skillPath = resolve(skillDir, "instructions.md");
  const content = readFileSync(skillPath, "utf-8");

  const referencesDir = resolve(skillDir, "references");
  const referenceContent = existsSync(referencesDir)
    ? readdirSync(referencesDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => readFileSync(resolve(referencesDir, f), "utf-8"))
        .join("\n")
    : "";
  const combined = `${content}\n${referenceContent}`;

  it("SKILL.md contains a Rule Distillation or equivalent heading", () => {
    expect(
      content.match(/Rule Distillation|规则蒸馏/),
      "SKILL.md missing Rule Distillation heading",
    ).not.toBeNull();
  });

  it("SKILL.md references all four data sources", () => {
    expect(combined).toContain("known-failures");
    expect(combined).toContain("instincts");
    expect(combined).toContain("skill-feedback");
    expect(combined).toContain("metrics");
  });

  it("SKILL.md documents all five threshold conditions", () => {
    // known-failures: occurrence >= 3
    expect(combined).toMatch(/occurrence\s*>=\s*3/);
    // instincts: confidence >= 0.8
    expect(combined).toMatch(/confidence\s*>=\s*0\.8/);
    // skill-feedback: frequency >= 3
    expect(combined).toMatch(/frequency\s*>=\s*3/);
    // session journals: 3+ sessions
    expect(combined).toMatch(/3\+?\s*会话|3\+?\s*session/i);
    // metrics: 3+ session degradation
    expect(combined).toMatch(/3\+?\s*session|连续\s*3/i);
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

  it("CLAUDE.md line count is within the 100–150 target range", () => {
    const claudeLines = claude.split("\n").length;
    expect(claudeLines).toBeGreaterThanOrEqual(100);
    expect(claudeLines).toBeLessThanOrEqual(150);
  });

  it("templates/CLAUDE.md line count is within the 100–150 target range", () => {
    const templateLines = template.split("\n").length;
    expect(templateLines).toBeGreaterThanOrEqual(100);
    expect(templateLines).toBeLessThanOrEqual(150);
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
// 19. UltraReview CI integration

describe("Contract: ultrareview CI workflow", () => {
  const workflowPath = resolve(ROOT, ".github", "workflows", "ultrareview.yml");

  it(".github/workflows/ultrareview.yml exists", () => {
    expect(existsSync(workflowPath), "ultrareview.yml workflow missing").toBe(true);
  });

  if (!existsSync(workflowPath)) return;

  const workflow = readFileSync(workflowPath, "utf-8");

  it("triggers on pull_request events", () => {
    expect(workflow, "missing pull_request trigger").toContain("pull_request");
  });

  it("references ANTHROPIC_API_KEY secret", () => {
    expect(workflow, "missing ANTHROPIC_API_KEY reference").toContain("ANTHROPIC_API_KEY");
  });

  it("uses upload-artifact step", () => {
    expect(workflow, "missing upload-artifact step").toContain("upload-artifact");
  });

  it("calls run-ci-ultrareview.sh", () => {
    expect(workflow, "missing run-ci-ultrareview.sh invocation").toContain("run-ci-ultrareview.sh");
  });

  it("has PR comment step", () => {
    expect(workflow, "missing PR comment step").toContain("github-script");
  });
});

describe("Contract: run-ci-ultrareview.sh script", () => {
  const scriptPath = resolve(ROOT, "scripts", "run-ci-ultrareview.sh");

  it("scripts/run-ci-ultrareview.sh exists and is executable", () => {
    expect(existsSync(scriptPath), "run-ci-ultrareview.sh missing").toBe(true);
    const stat = statSync(scriptPath);
    // Check executable bit (owner)
    expect(stat.mode & 0o100, "script not executable").toBeTruthy();
  });

  if (!existsSync(scriptPath)) return;

  const script = readFileSync(scriptPath, "utf-8");

  it("references claude ultrareview command", () => {
    expect(script, "missing claude ultrareview invocation").toContain("claude ultrareview");
  });

  it("handles P0 exit code", () => {
    expect(script, "missing P0 exit 1 handling").toContain("exit 1");
  });

  it("supports CI_ULTRAREVIEW_STRICT env var", () => {
    expect(script, "missing STRICT env var support").toContain("CI_ULTRAREVIEW_STRICT");
  });

  it("supports CI_ULTRAREVIEW_TIMEOUT env var", () => {
    expect(script, "missing TIMEOUT env var support").toContain("CI_ULTRAREVIEW_TIMEOUT");
  });
});

describe("Contract: review artifact template", () => {
  const templatePath = resolve(ROOT, "templates", "review-ci.md.tmpl");

  it("templates/review-ci.md.tmpl exists", () => {
    expect(existsSync(templatePath), "review artifact template missing").toBe(true);
  });

  if (!existsSync(templatePath)) return;

  const template = readFileSync(templatePath, "utf-8");

  it("contains required frontmatter fields", () => {
    expect(template).toContain("source:");
    expect(template).toContain("pr_number:");
    expect(template).toContain("commit_sha:");
    expect(template).toContain("severity_counts:");
  });

  it("contains required sections", () => {
    expect(template).toContain("## Summary");
    expect(template).toContain("## Findings");
    expect(template).toContain("## Raw JSON");
  });
});

// ---------------------------------------------------------------------------
// 20. plugin.json mcpServers field (forge-context MCP)
// ---------------------------------------------------------------------------

describe("Contract: forge-context MCP server declared in .mcp.json", () => {
  const mcpPath = resolve(ROOT, ".mcp.json");
  const content = readFileSync(mcpPath, "utf-8");
  const json = JSON.parse(content);

  it(".mcp.json contains mcpServers field", () => {
    expect(json.mcpServers).toBeDefined();
  });

  it(".mcp.json contains forge-context entry", () => {
    expect(json.mcpServers["forge-context"]).toBeDefined();
  });

  it("forge-context uses node as command", () => {
    expect(json.mcpServers["forge-context"].command).toBe("node");
  });

  it("forge-context args reference the bundled server dist/forge-context.mjs", () => {
    const argPath = json.mcpServers["forge-context"].args[0];
    // The marketplace-install path resolves to the self-contained bundle
    // (inlines @modelcontextprotocol/sdk + zod + ajv), not the tsc output.
    expect(argPath).toBe("dist/forge-context.mjs");
  });
});

// ---------------------------------------------------------------------------
// 21. SKILL references/ structure
// ---------------------------------------------------------------------------

describe("Contract: SKILL references/ structure", () => {
  const skillsWithRefs: Record<string, string[]> = {
    build: [
      "tdd-rules.md",
      "closure-probes.md",
      "context-budget.md",
      "anti-drift.md",
      "function-contracts.md",
    ],
    review: [
      "confidence-filtering.md",
      "dedup-pipeline.md",
      "quality-gate.md",
      "function-contracts.md",
    ],
    plan: [
      "atomic-task-format.md",
      "lightweight-task-format.md",
      "prohibited-content.md",
      "function-contracts.md",
    ],
  };

  const libDir = resolve(ROOT, "skills", "forge", "lib");

  for (const [skill, expectedFiles] of Object.entries(skillsWithRefs)) {
    describe(`skills/forge/lib/${skill}/references/`, () => {
      for (const file of expectedFiles) {
        it(`${file} exists`, () => {
          const refPath = resolve(libDir, skill, "references", file);
          expect(existsSync(refPath), `Missing: skills/forge/lib/${skill}/references/${file}`).toBe(
            true,
          );
        });
      }
    });
  }

  it("all internal reference pointers in instructions.md files point to existing files", () => {
    for (const skill of Object.keys(skillsWithRefs)) {
      const skillContent = readFileSync(resolve(libDir, skill, "instructions.md"), "utf-8");
      const refs = skillContent.match(/→ 详见 references\/[\w-]+\.md/g) || [];
      for (const ref of refs) {
        const fileName = ref.replace("→ 详见 references/", "");
        const refPath = resolve(libDir, skill, "references", fileName);
        expect(
          existsSync(refPath),
          `Broken pointer in ${skill}/instructions.md: references/${fileName}`,
        ).toBe(true);
      }
    }
  });

  it("cross-SKILL reference pointers resolve to existing files", () => {
    const crossRefPattern = /\.\.\/build\/references\/[\w-]+\.md/g;

    for (const dir of readdirSync(libDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const instrPath = resolve(libDir, dir.name, "instructions.md");
      if (!existsSync(instrPath)) continue;

      const content = readFileSync(instrPath, "utf-8");
      const refs = content.match(crossRefPattern) || [];
      for (const ref of refs) {
        const resolvedPath = resolve(libDir, dir.name, ref);
        expect(
          existsSync(resolvedPath),
          `Broken cross-SKILL ref in ${dir.name}/instructions.md: ${ref}`,
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 20. Frozen-zone structured feedback scripts
// ---------------------------------------------------------------------------

describe("Contract: frozen-zone structured feedback scripts", () => {
  const requiredScripts = [
    "scripts/zone-registry.sh",
    "scripts/hook-check-frozen-structured.sh",
    "scripts/hook-check-frozen-post.sh",
    "scripts/hook-check-frozen.sh",
    "scripts/print-zone-registry.sh",
    "scripts/summarize-frozen-events.sh",
  ];

  for (const script of requiredScripts) {
    it(`${script} exists`, () => {
      const scriptPath = resolve(ROOT, script);
      expect(existsSync(scriptPath), `Missing: ${script}`).toBe(true);
    });

    it(`${script} is executable`, () => {
      const scriptPath = resolve(ROOT, script);
      const mode = statSync(scriptPath).mode;
      expect((mode & 0o111) !== 0, `${script} is not executable. Run: chmod +x ${script}`).toBe(
        true,
      );
    });
  }

  it("hooks.json contains PostToolUse frozen-post hook", () => {
    const hooksPath = resolve(ROOT, "hooks/hooks.json");
    const hooksFile = JSON.parse(readFileSync(hooksPath, "utf-8"));
    const postGroups = hooksFile.hooks.PostToolUse as Array<{
      hooks: Array<{ command?: string }>;
    }>;
    const hasFrozenPost = postGroups.some((group) =>
      group.hooks.some((h) => h.command?.includes("frozen-post")),
    );
    expect(hasFrozenPost, "PostToolUse missing frozen-post hook").toBe(true);
  });

  it("hooks.json PreToolUse frozen matcher includes MultiEdit", () => {
    const hooksPath = resolve(ROOT, "hooks/hooks.json");
    const hooksFile = JSON.parse(readFileSync(hooksPath, "utf-8"));
    const preGroups = hooksFile.hooks.PreToolUse as Array<{
      matcher?: string;
      hooks: Array<{ command?: string }>;
    }>;
    const frozenGroup = preGroups.find((group) =>
      group.hooks.some((h) => h.command?.includes("hook-check-frozen")),
    );
    expect(frozenGroup?.matcher).toContain("MultiEdit");
  });

  it("config.md contains HARD-GATE frozen-zone-protection block", () => {
    const configPath = resolve(ROOT, ".forge/config.md");
    const config = readFileSync(configPath, "utf-8");
    expect(config).toContain('<HARD-GATE name="frozen-zone-protection">');
    expect(config).toContain("</HARD-GATE>");
  });
});

// ---------------------------------------------------------------------------
// Contract: Stop hooks must not block (8-block cap compliance)
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Contract: stop hooks should not block", () => {
  const STOP_HOOK_SCRIPTS = [
    "scripts/stop-incomplete-tasks.mjs",
    "scripts/stop-pending-rules.mjs",
    "scripts/record-evolved-rule-violation.mjs",
    "scripts/flag-stale-evolved-rules.mjs",
    "scripts/cmux-mirror/sync-once.mjs",
    "scripts/stop-phase-verify.mjs",
  ];

  for (const script of STOP_HOOK_SCRIPTS) {
    it(`${script} exits 0 and emits no block JSON`, () => {
      const tmp = mkdtempSync(join(tmpdir(), "forge-stop-"));
      try {
        const cmd = script.endsWith(".sh") ? "bash" : "node";
        const result = spawnSync(cmd, [resolve(ROOT, script)], {
          cwd: tmp,
          encoding: "utf-8",
          timeout: 10000,
        });
        expect(result.status).toBe(0);
        expect(result.stdout).not.toMatch(/"continue"\s*:\s*false/);
        expect(result.stdout).not.toMatch(/"decision"\s*:\s*"block"/);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }

  it("hooks/hooks.json Stop section delegates to concrete script commands only", () => {
    const hooksPath = resolve(ROOT, "hooks/hooks.json");
    const hooksFile = JSON.parse(readFileSync(hooksPath, "utf-8"));
    const stopGroups = (hooksFile.hooks?.Stop ?? []) as Array<{
      hooks?: Array<{ type?: string; command?: string; args?: string[] }>;
    }>;
    const invalidHooks: string[] = [];
    for (const group of stopGroups) {
      for (const hook of group.hooks ?? []) {
        if (hook.args) {
          invalidHooks.push(`args-only:${hook.args.join(" ")}`);
          continue;
        }
        if (hook.type !== "command" || !hook.command) {
          invalidHooks.push(`missing-command:${JSON.stringify(hook)}`);
          continue;
        }
        if (hook.command.includes("persistent-loop.sh")) {
          invalidHooks.push(`stale-persistent-loop:${hook.command}`);
          continue;
        }
        const match = hook.command.match(/^(node|bash) (scripts\/[A-Za-z0-9_./-]+)(?:\s.*)?$/);
        if (!match) {
          invalidHooks.push(`inline-shell:${hook.command}`);
          continue;
        }
        const scriptPath = resolve(ROOT, match[2]);
        if (!existsSync(scriptPath)) {
          invalidHooks.push(`missing-script:${match[2]}`);
        }
      }
    }
    expect(invalidHooks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Contract: PostToolUse boundary feedback
// ---------------------------------------------------------------------------

describe("Contract: PostToolUse boundary feedback", () => {
  it("check-context-boundary PostToolUse mode blocks on cross-context import", () => {
    const tmp = mkdtempSync(join(tmpdir(), "forge-postu-"));
    try {
      // Create src/ directory structure
      mkdirSync(join(tmp, "src"), { recursive: true });
      mkdirSync(join(tmp, "src", "payment"), { recursive: true });
      mkdirSync(join(tmp, "src", "order"), { recursive: true });

      // Write a file with cross-context import
      writeFileSync(
        join(tmp, "src", "payment", "service.ts"),
        'import { Order } from "../order/types";\nexport class PaymentService {}\n',
      );

      // Write tool input file (relative path so ownership glob matches)
      const toolInputPath = join(tmp, "tool-input.json");
      writeFileSync(
        toolInputPath,
        JSON.stringify({
          file_path: "src/payment/service.ts",
        }),
      );

      // Write ownership map
      mkdirSync(join(tmp, ".forge"), { recursive: true });
      writeFileSync(
        join(tmp, ".forge", "context-ownership.yaml"),
        "src/payment/**: payment\nsrc/order/**: order\n",
      );

      // Write context map
      mkdirSync(join(tmp, ".forge", "custom", "contexts"), { recursive: true });
      writeFileSync(join(tmp, ".forge", "custom", "contexts", "_map.yaml"), "");

      const scriptPath = resolve(ROOT, "scripts/check-context-boundary.mjs");
      const result = spawnSync("node", [scriptPath, "PostToolUse", toolInputPath], {
        cwd: tmp,
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("上下文边界违规");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("hooks/hooks.json has at least one PostToolUse hook with continueOnBlock", () => {
    const hooksPath = resolve(ROOT, "hooks", "hooks.json");
    const hooks = JSON.parse(readFileSync(hooksPath, "utf-8"));
    const postGroups = hooks.hooks?.PostToolUse as Array<{
      hooks: Array<Record<string, unknown>>;
    }>;

    const hasContinueOnBlock =
      postGroups?.some((group) => group.hooks?.some((hook) => hook.continueOnBlock === true)) ??
      false;

    expect(hasContinueOnBlock).toBe(true);
  });

  // CI drift detection in forge-test SKILL
  it("forge-test SKILL.md contains drift detection section", () => {
    const skillPath = resolve(ROOT, "skills/forge/lib/test/instructions.md");
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("漂移检测");
    expect(content).toContain("detectCiCommandDrift");
  });

  // pre-push hook exists and is executable
  it(".githooks/pre-push exists and is executable", () => {
    const hookPath = resolve(ROOT, ".githooks/pre-push");
    expect(existsSync(hookPath)).toBe(true);
    const mode = statSync(hookPath).mode & 0o777;
    expect(mode & 0o111).not.toBe(0); // at least one execute bit
  });
});

describe("CE-Inspired Review Enhancement - Phase 1", () => {
  const AGENTS_DIR = resolve(__dirname, "..", "agents");

  it("spec-check.md has model: inherit", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "spec-check.md"), "utf-8");
    expect(content).toMatch(/^model:\s*inherit\b/m);
  });

  it("spec-check.md has Confidence Calibration section", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "spec-check.md"), "utf-8");
    expect(content).toMatch(/## Confidence Calibration/);
    expect(content).toMatch(/Anchor/);
  });

  it("spec-check.md has JSON output protocol", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "spec-check.md"), "utf-8");
    expect(content).toMatch(/"reviewer":\s*"spec-check"/);
    expect(content).toMatch(/"confidence":\s*\d+/);
    expect(content).toMatch(/"autofix_class":\s*"(manual|advisory|safe_auto|gated_auto)"/);
  });

  it("quality-check.md has model: sonnet", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "quality-check.md"), "utf-8");
    expect(content).toMatch(/^model:\s*sonnet\b/m);
  });

  it("quality-check.md has high-threshold confidence calibration (≤50 P2/P3 suppressed)", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "quality-check.md"), "utf-8");
    expect(content).toMatch(/## Confidence Calibration/);
    expect(content).toMatch(/suppress/i);
  });

  it("quality-check.md has JSON output protocol", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "quality-check.md"), "utf-8");
    expect(content).toMatch(/"reviewer":\s*"quality-check"/);
  });

  it("security-check.md has model: inherit", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "security-check.md"), "utf-8");
    expect(content).toMatch(/^model:\s*inherit\b/m);
  });

  it("security-check.md preserves P0 at confidence=50 (low threshold)", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "security-check.md"), "utf-8");
    expect(content).toMatch(/P0.*50|50.*P0/);
  });

  it("security-check.md emits security-specific suppression warning", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "security-check.md"), "utf-8");
    expect(content).toMatch(/suppression warning|Suppression Warning/i);
  });

  it("security-check.md has JSON output protocol", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "security-check.md"), "utf-8");
    expect(content).toMatch(/"reviewer":\s*"security-check"/);
  });

  it("forge-review.md has Confidence Anchor definition (5 levels)", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/## Confidence Anchor/);
    expect(content).toMatch(/\b100\b.*\b75\b.*\b50\b.*\b25\b.*\b0\b/s);
  });

  it("forge-review.md implements confidence gate with P0@50 exception", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/## Confidence Gate|Confidence Gate/);
    expect(content).toMatch(/P0.*50|severity\s*=\s*P0.*confidence.*50/s);
  });

  it("forge-review.md implements Stable Finding IDs (R-NNN)", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/R-NNN|Stable Finding ID/);
  });

  it("forge-review.md supports --output-format=v1|v2 (backward compat)", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/--output-format=v1\|v2|output-format/);
  });

  it(".forge/config.md has review_* settings", () => {
    const content = readFileSync(resolve(__dirname, "..", ".forge/config.md"), "utf-8");
    expect(content).toMatch(/review_force_model/);
    expect(content).toMatch(/review_confidence_threshold/);
    expect(content).toMatch(/review_enable_adversarial/);
    expect(content).toMatch(/review_enable_validation/);
    expect(content).toMatch(/context_budget/);
  });

  it("forge-learn SKILL has dual-track templates", () => {
    const content = readFileSync(
      resolve(__dirname, "..", "skills/forge/lib/learn/instructions.md"),
      "utf-8",
    );
    expect(content).toMatch(/Dual-Track Knowledge System/);
    expect(content).toMatch(/Bug Track/);
    expect(content).toMatch(/Knowledge Track/);
    expect(content).toMatch(/track:\s*bug/);
    expect(content).toMatch(/track:\s*knowledge/);
  });
});

describe("CE-Inspired Review Enhancement - Phase 2", () => {
  const AGENTS_DIR = resolve(__dirname, "..", "agents");

  it("adversarial-check.md exists", () => {
    expect(existsSync(resolve(AGENTS_DIR, "adversarial-check.md"))).toBe(true);
  });

  it("adversarial-check.md has model: sonnet", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "adversarial-check.md"), "utf-8");
    expect(content).toMatch(/^model:\s*sonnet\b/m);
  });

  it("adversarial-check.md has all 4 techniques", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "adversarial-check.md"), "utf-8");
    expect(content).toMatch(/Assumption Violation/i);
    expect(content).toMatch(/Composition Failure/i);
    expect(content).toMatch(/Cascade Construction/i);
    expect(content).toMatch(/Abuse Case/i);
  });

  it("adversarial-check.md has depth calibration (Quick/Standard/Deep)", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "adversarial-check.md"), "utf-8");
    expect(content).toMatch(/\bQuick\b/);
    expect(content).toMatch(/\bStandard\b/);
    expect(content).toMatch(/\bDeep\b/);
  });

  it("forge-review.md has dedup algorithm (normalize + line_bucket)", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/normalize\(file\)/);
    expect(content).toMatch(/normalize\(title\)/);
    expect(content).toMatch(/line_bucket/);
  });

  it("forge-review.md has cross-reviewer promotion", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/Cross-Reviewer Promotion/i);
    expect(content).toMatch(/cross-validated/i);
  });

  it("forge-review.md has adversarial-check dispatch tier conditions", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/adversarial-check/);
    expect(content).toMatch(/Full/);
    expect(content).toMatch(/Standard/);
    expect(content).toMatch(/Light/);
  });

  it("CLAUDE.md §3.2 contains adversarial-check row", () => {
    const content = readFileSync(resolve(__dirname, "..", "CLAUDE.md"), "utf-8");
    expect(content).toMatch(/adversarial-check/);
  });
});

describe("CE-Inspired Review Enhancement - Phase 3", () => {
  const AGENTS_DIR = resolve(__dirname, "..", "agents");

  it("validation-pass.md exists", () => {
    expect(existsSync(resolve(AGENTS_DIR, "validation-pass.md"))).toBe(true);
  });

  it("validation-pass.md has tiered model strategy (P0/P1 inherit, P2/P3 sonnet)", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "validation-pass.md"), "utf-8");
    expect(content).toMatch(/inherit|Opus/);
    expect(content).toMatch(/sonnet/);
    expect(content).toMatch(/P0\s*\/\s*P1/);
    expect(content).toMatch(/P2\s*\/\s*P3/);
  });

  it("validation-pass.md has no-commitment-effect protocol", () => {
    const content = readFileSync(resolve(AGENTS_DIR, "validation-pass.md"), "utf-8");
    expect(content).toMatch(/No Commitment Effect|无承诺效应/);
    expect(content).toMatch(/confirmed/);
  });

  it("forge-review.md has Validation Pass integration", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/Validation Pass/i);
    expect(content).toMatch(/--no-validation/);
    expect(content).toMatch(/review-validation\.jsonl/);
  });

  it("forge-review.md has Autofix routing (4 classes)", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/safe_auto/);
    expect(content).toMatch(/gated_auto/);
    expect(content).toMatch(/\bmanual\b/);
    expect(content).toMatch(/advisory/);
    expect(content).toMatch(/Autofix Routing/i);
  });

  it("forge-review.md applies safe_auto one at a time (Critic S-003 fix)", () => {
    const content = readFileSync(
      resolve(__dirname, "..", ".claude/agents/forge-review.md"),
      "utf-8",
    );
    expect(content).toMatch(/one at a time/i);
    expect(content).toMatch(/per-fix CI/);
  });

  it("review skill has new CLI parameters", () => {
    const content = readFileSync(
      resolve(__dirname, "..", "skills/forge/lib/review/instructions.md"),
      "utf-8",
    );
    expect(content).toMatch(/--autofix/);
    expect(content).toMatch(/--no-validation/);
    expect(content).toMatch(/--compact-safe/);
    expect(content).toMatch(/--output-format=v1\|v2|output-format/);
  });
});
