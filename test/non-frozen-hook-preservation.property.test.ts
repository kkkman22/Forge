/**
 * Preservation Property Test: Non-Frozen Hook Behavior Unchanged
 *
 * Property 4 (Preservation): For all hook invocations that are NOT frozen-zone checks
 * (SessionStart, UserPromptSubmit, PostToolUse, Stop, TeammateIdle, TaskCompleted,
 * and the plan-context PreToolUse hook), the hooks.json SHALL produce exactly the same
 * behavior as the original, preserving all `|| true` fallbacks on non-protection hooks.
 *
 * This test captures the CURRENT (unfixed) state of non-frozen hooks as a baseline.
 * After the fix (which only removes `|| true` from frozen-check hooks), these tests
 * must continue to pass — confirming no regressions on unrelated hooks.
 *
 * **Validates: Requirements 3.4, 3.5, 3.6**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Types and loader (shared with frozen-hook-exit-code.property.test.ts)
// ---------------------------------------------------------------------------

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

interface HookMatcher {
  matcher?: string;
  if?: string;
  hooks: HookEntry[];
}

interface HooksConfig {
  hooks: Record<string, HookMatcher[]>;
}

function loadHooksConfig(): HooksConfig {
  const hooksPath = resolve(process.cwd(), "hooks/hooks.json");
  const content = readFileSync(hooksPath, "utf-8");
  return JSON.parse(content) as HooksConfig;
}

// ---------------------------------------------------------------------------
// Snapshot of expected non-frozen hook state (observed on UNFIXED code)
// ---------------------------------------------------------------------------

/**
 * These snapshots capture the exact command strings and structure of every
 * non-frozen-check hook in hooks.json. The fix MUST NOT alter any of these.
 */

const EXPECTED_SESSION_START_HOOKS: HookMatcher[] = [
  {
    hooks: [
      {
        type: "command",
        command:
          "bash forge/scripts/auto-resume.sh 2>/dev/null || bash ~/.claude/skills/forge/scripts/auto-resume.sh 2>/dev/null || true",
        timeout: 5,
      },
    ],
  },
  {
    hooks: [
      {
        type: "command",
        command:
          "if [ -f .forge/knowledge/evolved-rules.md ]; then echo '=== Evolved Rules ==='; cat .forge/knowledge/evolved-rules.md; fi",
        timeout: 5,
      },
    ],
  },
];

const EXPECTED_USER_PROMPT_SUBMIT_HOOKS: HookMatcher[] = [
  {
    hooks: [
      {
        type: "command",
        command:
          "node forge/scripts/inject-plan-context.mjs 2>/dev/null || node ~/.claude/skills/forge/scripts/inject-plan-context.mjs 2>/dev/null || true",
      },
    ],
  },
  {
    hooks: [
      {
        type: "command",
        command: "node scripts/cmux-mirror/sync-once.mjs .forge 2>/dev/null || true",
        timeout: 2,
      },
    ],
  },
];

const EXPECTED_POST_TOOL_USE_HOOKS: HookMatcher[] = [
  {
    matcher: "Write|Edit|MultiEdit",
    hooks: [
      {
        type: "command",
        command:
          "bash forge/scripts/hook-check-frozen-post.sh 2>/dev/null || bash ~/.claude/skills/forge/scripts/hook-check-frozen-post.sh 2>/dev/null || true",
        timeout: 5,
      },
    ],
  },
  {
    matcher: "Write|Edit",
    if: "Write(.forge/**)|Edit(.forge/**)",
    hooks: [
      {
        type: "command",
        command:
          "if [ -d .forge/status ] || [ -f .forge/status.md ]; then echo '📝 代码已修改。请记得更新 .forge/progress/ 中的任务状态。'; fi",
      },
    ],
  },
  {
    matcher: "Write|Edit",
    if: "Write(.forge/**)|Edit(.forge/**)",
    hooks: [
      {
        type: "command",
        command: "node scripts/cmux-mirror/sync-once.mjs .forge 2>/dev/null || true",
        timeout: 2,
      },
    ],
  },
  {
    matcher: "Write|Edit",
    if: "Write(.forge/**)|Edit(.forge/**)",
    hooks: [
      {
        type: "command",
        command:
          'node scripts/rebuild-feature-dossier.mjs --from-path "$TOOL_INPUT_FILE" 2>/dev/null || true',
        timeout: 5,
      },
    ],
  },
  {
    matcher: "Write|Edit",
    if: "Write(.forge/**)|Edit(.forge/**)",
    hooks: [
      {
        type: "command",
        command:
          'node scripts/knowledge-hook-dispatch.mjs --from-path "$TOOL_INPUT_FILE" 2>/dev/null || true',
        timeout: 5,
      },
    ],
  },
];

const EXPECTED_STOP_HOOKS: HookMatcher[] = [
  {
    hooks: [
      {
        type: "command",
        command:
          "if [ -f .forge/progress/*.md ] 2>/dev/null; then incomplete=$(grep -c '\\- \\[ \\]' .forge/progress/*.md 2>/dev/null || echo 0); if [ \"$incomplete\" -gt 0 ]; then echo '⚠️ 仍有未完成的任务。下次会话可使用 /forge resume 恢复上下文。'; else echo '✅ 任务已完成。建议运行 /forge learn 沉淀本次开发经验。'; fi; fi",
      },
      {
        type: "command",
        command:
          "bash forge/scripts/persistent-loop.sh 2>/dev/null || bash ~/.claude/skills/forge/scripts/persistent-loop.sh 2>/dev/null || true",
        timeout: 5,
      },
    ],
  },
  {
    hooks: [
      {
        type: "command",
        command:
          "if [ -f .forge/knowledge/evolved-rules.md ] && grep -q 'PENDING' .forge/knowledge/evolved-rules.md 2>/dev/null; then count=$(grep -c 'PENDING' .forge/knowledge/evolved-rules.md 2>/dev/null || echo 0); echo \"⚠️ 有 $count 条待审核的规则提案。运行 /forge learn 查看并审批。\"; fi",
        timeout: 5,
      },
    ],
  },
  {
    hooks: [
      {
        type: "command",
        command: "node scripts/record-evolved-rule-violation.mjs 2>/dev/null || true",
        timeout: 5,
      },
    ],
  },
  {
    hooks: [
      {
        type: "command",
        command: "node scripts/flag-stale-evolved-rules.mjs 2>/dev/null || true",
        timeout: 5,
      },
    ],
  },
  {
    hooks: [
      {
        type: "command",
        command: "node scripts/cmux-mirror/sync-once.mjs .forge 2>/dev/null || true",
        timeout: 2,
      },
    ],
  },
  {
    hooks: [
      {
        type: "command",
        command:
          'if [ -f .forge/status.md ]; then phase=$(grep \'^phase:\' .forge/status.md 2>/dev/null | sed \'s/phase: *"\\{0,1\\}//;s/"\\{0,1\\} *$//\'); if [ -n "$phase" ] && [ "$phase" != \'completed\' ] && [ "$phase" != \'\' ]; then echo "⚠️ Phase: $phase — did you verify your last change? Run the relevant test/lint command before stopping."; fi; fi',
        timeout: 3,
      },
    ],
  },
];

const EXPECTED_TEAMMATE_IDLE_HOOKS: HookMatcher[] = [
  {
    hooks: [
      {
        type: "command",
        command:
          "if [ -d .forge/status ]; then status_file=$(ls -t .forge/status/*.md 2>/dev/null | head -1); else status_file='.forge/status.md'; fi; phase=$(grep '^phase:' \"$status_file\" 2>/dev/null | sed 's/phase: *\"\\{0,1\\}//;s/\"\\{0,1\\} *$//'); if [ \"$phase\" = 'review' ] || [ \"$phase\" = 'decide' ]; then echo '队友空闲。请检查是否所有评审/决策维度都已完成输出，未完成的队友应继续工作。'; fi",
      },
    ],
  },
];

const EXPECTED_TASK_COMPLETED_HOOKS: HookMatcher[] = [
  {
    hooks: [
      {
        type: "command",
        command: "echo '✅ 团队任务已完成。负责人请汇总队友输出并检查是否需要合并发现。'",
      },
    ],
  },
];

/** The plan context injection hook — the FIRST PreToolUse entry with matcher "Write|Edit|Bash" */
const EXPECTED_PLAN_CONTEXT_HOOK: HookMatcher = {
  matcher: "Write|Edit",
  if: "Write(.forge/**)|Edit(.forge/**)",
  hooks: [
    {
      type: "command",
      command: "head -30 .forge/plans/*.md 2>/dev/null || true",
    },
  ],
};

// ---------------------------------------------------------------------------
// Non-frozen hook event types (all except PreToolUse frozen-check entries)
// ---------------------------------------------------------------------------

const NON_FROZEN_EVENT_TYPES = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "Stop",
  "TeammateIdle",
  "TaskCompleted",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _isFrozenCheckHook(_matcher: string | undefined, hook: HookEntry): boolean {
  return hook.command.includes("check-frozen.sh") || hook.command.includes("check-frozen-post.sh");
}

function getPlanContextHook(config: HooksConfig): HookMatcher | undefined {
  const preToolUseHooks = config.hooks.PreToolUse ?? [];
  return preToolUseHooks.find((group) =>
    group.hooks.some((h) => h.command.includes("head -30 .forge/plans/")),
  );
}

function getNonFrozenPreToolUseHooks(config: HooksConfig): HookMatcher[] {
  const preToolUseHooks = config.hooks.PreToolUse ?? [];
  return preToolUseHooks.filter(
    (group) => !group.hooks.some((h) => h.command.includes("check-frozen.sh")),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Preservation: Non-frozen hooks are byte-identical to baseline", () => {
  const config = loadHooksConfig();

  it("SessionStart hooks are byte-identical to observed baseline", () => {
    expect(config.hooks.SessionStart).toEqual(EXPECTED_SESSION_START_HOOKS);
  });

  it("UserPromptSubmit hooks are byte-identical to observed baseline", () => {
    expect(config.hooks.UserPromptSubmit).toEqual(EXPECTED_USER_PROMPT_SUBMIT_HOOKS);
  });

  it("PostToolUse hooks are byte-identical to observed baseline", () => {
    expect(config.hooks.PostToolUse).toEqual(EXPECTED_POST_TOOL_USE_HOOKS);
  });

  it("Stop hooks are byte-identical to observed baseline", () => {
    expect(config.hooks.Stop).toEqual(EXPECTED_STOP_HOOKS);
  });

  it("TeammateIdle hooks are byte-identical to observed baseline", () => {
    expect(config.hooks.TeammateIdle).toEqual(EXPECTED_TEAMMATE_IDLE_HOOKS);
  });

  it("TaskCompleted hooks are byte-identical to observed baseline", () => {
    expect(config.hooks.TaskCompleted).toEqual(EXPECTED_TASK_COMPLETED_HOOKS);
  });
});

describe("Preservation: Plan context injection hook retains || true fallback", () => {
  const config = loadHooksConfig();

  it("plan context hook exists with matcher Write|Edit", () => {
    const planHook = getPlanContextHook(config);
    expect(planHook).toBeDefined();
    expect(planHook?.matcher).toBe("Write|Edit");
  });

  it("plan context hook command is byte-identical to observed baseline", () => {
    const planHook = getPlanContextHook(config);
    expect(planHook).toEqual(EXPECTED_PLAN_CONTEXT_HOOK);
  });

  it("plan context hook command ends with || true", () => {
    const planHook = getPlanContextHook(config);
    expect(planHook).toBeDefined();
    const command = planHook?.hooks[0].command.trim();
    expect(command).toMatch(/\|\|\s*true$/);
  });
});

describe("Preservation: Hook structure for non-frozen hooks (property-based)", () => {
  const config = loadHooksConfig();

  // Collect all non-frozen-check hook entries for property-based testing
  const nonFrozenEntries: Array<{
    eventType: string;
    groupIndex: number;
    matcher: string | undefined;
    hook: HookEntry;
  }> = [];

  // Add all hooks from non-PreToolUse event types
  for (const eventType of NON_FROZEN_EVENT_TYPES) {
    const groups = config.hooks[eventType] ?? [];
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      for (const hook of group.hooks) {
        nonFrozenEntries.push({
          eventType,
          groupIndex: gi,
          matcher: group.matcher,
          hook,
        });
      }
    }
  }

  // Add the plan context PreToolUse hook (non-frozen)
  const nonFrozenPreToolUse = getNonFrozenPreToolUseHooks(config);
  for (let gi = 0; gi < nonFrozenPreToolUse.length; gi++) {
    const group = nonFrozenPreToolUse[gi];
    for (const hook of group.hooks) {
      nonFrozenEntries.push({
        eventType: "PreToolUse",
        groupIndex: gi,
        matcher: group.matcher,
        hook,
      });
    }
  }

  it("all non-frozen hooks have type 'command' (property-based)", () => {
    const entryArb = fc.constantFrom(...nonFrozenEntries);

    fc.assert(
      fc.property(entryArb, (entry) => {
        expect(entry.hook.type).toBe("command");
        return entry.hook.type === "command";
      }),
      { numRuns: nonFrozenEntries.length * 10 },
    );
  });

  it("all non-frozen hooks have non-empty command strings (property-based)", () => {
    const entryArb = fc.constantFrom(...nonFrozenEntries);

    fc.assert(
      fc.property(entryArb, (entry) => {
        expect(entry.hook.command.length).toBeGreaterThan(0);
        return entry.hook.command.length > 0;
      }),
      { numRuns: nonFrozenEntries.length * 10 },
    );
  });

  it("no non-frozen hook contains check-frozen.sh (property-based)", () => {
    const entryArb = fc.constantFrom(...nonFrozenEntries);

    fc.assert(
      fc.property(entryArb, (entry) => {
        const containsFrozenCheck = entry.hook.command.includes("check-frozen.sh");
        expect(containsFrozenCheck).toBe(false);
        return !containsFrozenCheck;
      }),
      { numRuns: nonFrozenEntries.length * 10 },
    );
  });

  it("hooks with timeouts preserve their timeout values (property-based)", () => {
    const timedEntries = nonFrozenEntries.filter((e) => e.hook.timeout !== undefined);

    if (timedEntries.length === 0) {
      // No timed entries — skip
      return;
    }

    const timedArb = fc.constantFrom(...timedEntries);

    // Expected timeouts keyed by command pattern
    const expectedTimeouts: Record<string, number> = {
      "auto-resume.sh": 5,
      "evolved-rules.md": 5,
      "inject-plan-context": 5,
      "persistent-loop.sh": 5,
      PENDING: 5,
      "sync-once.mjs": 2,
    };

    fc.assert(
      fc.property(timedArb, (entry) => {
        for (const [pattern, timeout] of Object.entries(expectedTimeouts)) {
          if (entry.hook.command.includes(pattern)) {
            expect(entry.hook.timeout).toBe(timeout);
            return entry.hook.timeout === timeout;
          }
        }
        return true;
      }),
      { numRuns: timedEntries.length * 10 },
    );
  });

  it("all expected non-frozen event types are present in hooks.json (property-based)", () => {
    const eventTypeArb = fc.constantFrom(...NON_FROZEN_EVENT_TYPES);

    fc.assert(
      fc.property(eventTypeArb, (eventType) => {
        const groups = config.hooks[eventType];
        expect(groups).toBeDefined();
        expect(groups.length).toBeGreaterThan(0);
        return groups !== undefined && groups.length > 0;
      }),
      { numRuns: NON_FROZEN_EVENT_TYPES.length * 10 },
    );
  });

  it("non-frozen hooks with || true fallback retain it (property-based)", () => {
    // These hooks are expected to have || true — they are non-protection hooks
    const hooksWithOrTrue = nonFrozenEntries.filter((e) =>
      e.hook.command.trim().endsWith("|| true"),
    );

    // We expect at least: SessionStart auto-resume, Stop persistent-loop, plan context
    expect(hooksWithOrTrue.length).toBeGreaterThanOrEqual(3);

    const orTrueArb = fc.constantFrom(...hooksWithOrTrue);

    fc.assert(
      fc.property(orTrueArb, (entry) => {
        const trimmed = entry.hook.command.trim();
        expect(trimmed).toMatch(/\|\|\s*true$/);
        return /\|\|\s*true$/.test(trimmed);
      }),
      { numRuns: hooksWithOrTrue.length * 10 },
    );
  });
});
