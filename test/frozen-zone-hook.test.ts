import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import {
  createFrozenZoneHook,
  createFrozenZonePostToolUseHook,
  type FrozenDiagnostic,
  renderPostHocViolation,
  writeFrozenBreachRecord,
} from "../src/frozen-zone-hook.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `frozen-zone-hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".forge"), { recursive: true });
  mkdirSync(join(dir, ".forge", "specs"), { recursive: true });
  mkdirSync(join(dir, ".forge", "plans"), { recursive: true });
  return dir;
}

function makeHookInput(toolName: string, filePath: string): HookInput {
  return {
    hookEventName: "PreToolUse",
    tool_name: toolName,
    tool_input: { file_path: filePath },
  } as unknown as HookInput;
}

// ---------------------------------------------------------------------------
// createFrozenZoneHook
// ---------------------------------------------------------------------------

describe("createFrozenZoneHook", () => {
  let tmpDir: string;
  let hook: ReturnType<typeof createFrozenZoneHook>;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    hook = createFrozenZoneHook(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty object for non-frozen-zone paths", async () => {
    const result = await hook(
      makeHookInput("Write", join(tmpDir, "src", "main.ts")),
      "tool-use-1",
      { signal: new AbortController().signal },
    );
    expect(result).toEqual({});
  });

  it("returns empty object for non-Write/Edit tools", async () => {
    const result = await hook(
      makeHookInput("Read", join(tmpDir, ".forge", "specs", "test.md")),
      "tool-use-2",
      { signal: new AbortController().signal },
    );
    expect(result).toEqual({});
  });

  it("returns empty object for empty file_path", async () => {
    const result = await hook(makeHookInput("Write", ""), "tool-use-3", {
      signal: new AbortController().signal,
    });
    expect(result).toEqual({});
  });

  it("denies write to frozen zone spec file with locked status", async () => {
    const specPath = join(tmpDir, ".forge", "specs", "my-spec.md");
    writeFileSync(specPath, "---\nstatus: locked\n---\n# My Spec\n");

    const result = await hook(makeHookInput("Write", specPath), "tool-use-4", {
      signal: new AbortController().signal,
    });

    const output = result as {
      hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
    };
    expect(output.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(output.hookSpecificOutput?.permissionDecisionReason).toContain("frozen");
  });

  it("denies edit to frozen zone plan file with approved status", async () => {
    const planPath = join(tmpDir, ".forge", "plans", "my-plan.md");
    writeFileSync(planPath, "---\nstatus: approved\n---\n# My Plan\n");

    const result = await hook(makeHookInput("Edit", planPath), "tool-use-5", {
      signal: new AbortController().signal,
    });

    const output = result as {
      hookSpecificOutput?: { permissionDecision?: string };
    };
    expect(output.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("allows write to frozen zone file without locked/approved status", async () => {
    const specPath = join(tmpDir, ".forge", "specs", "draft-spec.md");
    writeFileSync(specPath, "---\nstatus: draft\n---\n# Draft\n");

    const result = await hook(makeHookInput("Write", specPath), "tool-use-6", {
      signal: new AbortController().signal,
    });
    expect(result).toEqual({});
  });

  it("uses 'path' field when 'file_path' is absent", async () => {
    const specPath = join(tmpDir, ".forge", "specs", "spec2.md");
    writeFileSync(specPath, "---\nstatus: locked\n---\n# Spec2\n");

    const input = {
      hookEventName: "PreToolUse",
      tool_name: "Write",
      tool_input: { path: specPath },
    } as unknown as HookInput;

    const result = await hook(input, "tool-use-7", {
      signal: new AbortController().signal,
    });

    const output = result as {
      hookSpecificOutput?: { permissionDecision?: string };
    };
    expect(output.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("emits structured Frozen_Diagnostic fields for a locked spec (R1/R2)", async () => {
    const specPath = join(tmpDir, ".forge", "specs", "locked-spec.md");
    writeFileSync(specPath, "---\nstatus: locked\n---\n# Locked\n");

    const result = await hook(makeHookInput("Write", specPath), "tool-use-r1", {
      signal: new AbortController().signal,
    });

    const output = result as {
      hookSpecificOutput?: {
        permissionDecision?: string;
        permissionDecisionReason?: string;
        additionalContext?: string;
      };
    };
    // R2.1/R2.3: systemMessage includes category + unlock instruction.
    expect(output.hookSpecificOutput?.permissionDecision).toBe("deny");
    const reason = output.hookSpecificOutput?.permissionDecisionReason ?? "";
    expect(reason).toContain("frozen-spec");
    expect(reason).toContain("SPEC_LOCKED");
    expect(reason).toContain(specPath);
    expect(reason).toContain("/forge spec"); // unlock instruction
    // R2.4: additionalContext surfaces the suggested alternative + status.md reminder.
    const ctx = output.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toContain(".forge/findings/");
    expect(ctx).toContain(".forge/status.md");
  });

  it("classifies an approved plan as frozen-plan with PLAN_APPROVED (R1.4)", async () => {
    const planPath = join(tmpDir, ".forge", "plans", "approved-plan.md");
    writeFileSync(planPath, "---\nstatus: approved\n---\n# Plan\n");

    const result = await hook(makeHookInput("Edit", planPath), "tool-use-plan", {
      signal: new AbortController().signal,
    });

    const output = result as {
      hookSpecificOutput?: { permissionDecisionReason?: string };
    };
    const reason = output.hookSpecificOutput?.permissionDecisionReason ?? "";
    expect(reason).toContain("frozen-plan");
    expect(reason).toContain("PLAN_APPROVED");
  });
});

// ---------------------------------------------------------------------------
// Hook coexistence with SDK sandbox
// ---------------------------------------------------------------------------

describe("Frozen zone hook independence from SDK sandbox", () => {
  it("hook output format matches SyncHookJSONOutput schema", async () => {
    const tmpDir = makeTmpDir();
    const specPath = join(tmpDir, ".forge", "specs", "locked.md");
    writeFileSync(specPath, "---\nstatus: locked\n---\n# Locked\n");

    const hook = createFrozenZoneHook(tmpDir);
    const result = await hook(makeHookInput("Write", specPath), "tool-use-8", {
      signal: new AbortController().signal,
    });

    // Verify output structure matches SDK SyncHookJSONOutput
    expect(result).toBeDefined();
    const output = result as Record<string, unknown>;
    expect(output).toHaveProperty("hookSpecificOutput");
    const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput.hookEventName).toBe("PreToolUse");
    expect(hookOutput.permissionDecision).toBe("deny");
    expect(typeof hookOutput.permissionDecisionReason).toBe("string");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// PostToolUse defence-in-depth (frozen-zone-structured-feedback R3)
// ---------------------------------------------------------------------------

describe("createFrozenZonePostToolUseHook (R3 defence-in-depth)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("overwrites tool output with a revert prompt when a frozen-zone write slipped through (R3.1/R3.2)", async () => {
    const specPath = join(tmpDir, ".forge", "specs", "locked-spec.md");
    writeFileSync(specPath, "---\nstatus: locked\n---\n# Locked\n");
    const hook = createFrozenZonePostToolUseHook(tmpDir);

    const result = await hook(
      {
        hookEventName: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: specPath },
      } as unknown as HookInput,
      "post-tool-1",
      { signal: new AbortController().signal },
    );

    const output = result as {
      hookSpecificOutput?: {
        hookEventName?: string;
        updatedToolOutput?: string;
        additionalContext?: string;
      };
    };
    expect(output.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
    // R3.2: the marker prefix is required.
    expect(output.hookSpecificOutput?.updatedToolOutput).toContain(
      "⚠ Post-hoc frozen-zone violation detected",
    );
    expect(output.hookSpecificOutput?.updatedToolOutput).toContain(specPath);
    expect(output.hookSpecificOutput?.updatedToolOutput).toContain("Revert");
  });

  it("writes a breach audit record to .forge/runs/<stamp>-frozen-breach.md (R3.3)", async () => {
    const planPath = join(tmpDir, ".forge", "plans", "approved-plan.md");
    writeFileSync(planPath, "---\nstatus: approved\n---\n# Plan\n");
    const hook = createFrozenZonePostToolUseHook(tmpDir);

    await hook(
      {
        hookEventName: "PostToolUse",
        tool_name: "Edit",
        tool_input: { file_path: planPath, old_string: "a", new_string: "b" },
      } as unknown as HookInput,
      "post-tool-2",
      { signal: new AbortController().signal },
    );

    // R3.3: the audit record exists.
    const runsDir = join(tmpDir, ".forge", "runs");
    const breachFiles = existsSync(runsDir)
      ? readdirSync(runsDir).filter((f) => f.endsWith("-frozen-breach.md"))
      : [];
    expect(breachFiles.length).toBe(1);
    const body = readFileSync(join(runsDir, breachFiles[0]), "utf-8");
    expect(body).toContain(planPath);
    expect(body).toContain('tool_name: "Edit"');
    expect(body).toContain("frozen-plan");
    expect(body).toContain("PLAN_APPROVED");
  });

  it("returns empty for non-Write-class tools (R3.1 scoping)", async () => {
    const hook = createFrozenZonePostToolUseHook(tmpDir);
    const result = await hook(
      {
        hookEventName: "PostToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/tmp/anything" },
      } as unknown as HookInput,
      "post-tool-3",
      { signal: new AbortController().signal },
    );
    expect(result).toEqual({});
  });

  it("returns empty for a non-frozen file (no false positive)", async () => {
    const specPath = join(tmpDir, ".forge", "specs", "draft-spec.md");
    writeFileSync(specPath, "---\nstatus: draft\n---\n# Draft\n");
    const hook = createFrozenZonePostToolUseHook(tmpDir);
    const result = await hook(
      {
        hookEventName: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: specPath },
      } as unknown as HookInput,
      "post-tool-4",
      { signal: new AbortController().signal },
    );
    expect(result).toEqual({});
  });
});

describe("renderPostHocViolation + writeFrozenBreachRecord (R3 units)", () => {
  it("renderPostHocViolation includes the marker + revert instruction", () => {
    const diag: FrozenDiagnostic = {
      path: ".forge/specs/x.md",
      category: "frozen-spec",
      reason_code: "SPEC_LOCKED",
      reason_text: 'status "locked" forbids modification',
      unlock_instruction: "move the spec to draft via /forge spec.",
    };
    const out = renderPostHocViolation(diag);
    expect(out).toContain("⚠ Post-hoc frozen-zone violation detected");
    expect(out).toContain(".forge/specs/x.md");
    expect(out).toContain("Revert");
  });

  it("writeFrozenBreachRecord returns null on a non-writable root (best-effort, no throw)", () => {
    // Point at a path whose parent cannot be created (root-level forbidden).
    const result = writeFrozenBreachRecord("/nonexistent-root-zzz/.forge", {
      attemptedPath: "x",
      toolName: "Write",
      toolInput: {},
      diagnostic: {
        path: "x",
        category: "frozen-spec",
        reason_code: "SPEC_LOCKED",
        reason_text: "test",
        unlock_instruction: "test",
      },
      detectedAt: "2026-06-14T00:00:00.000Z",
    });
    expect(result).toBeNull();
  });
});
