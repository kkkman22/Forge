/**
 * Unit tests for set-active-plan.mjs — active-plan.json writer (R3).
 *
 * Tests the writer script that plan-approve and build-start call to populate
 * .tinkerman/state/active-plan.json (the single source of truth consumed by
 * inject-plan-context.mjs's reader).
 *
 * **Validates: Requirement 3 (R3 writer half — fixes SC-1 P0)**
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = join(process.cwd(), "scripts", "set-active-plan.mjs");
const POINTER_FILE = ".tinkerman/state/active-plan.json";

function createTempForge(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-setactive-test-"));
  mkdirSync(join(dir, ".tinkerman", "plans"), { recursive: true });
  mkdirSync(join(dir, ".tinkerman", "specs", "feature-x"), { recursive: true });
  mkdirSync(join(dir, ".tinkerman", "state"), { recursive: true });
  return dir;
}

function writePlan(dir: string, name: string, frontmatter: string, body: string): void {
  writeFileSync(join(dir, ".tinkerman", "plans", name), `---\n${frontmatter}\n---\n\n${body}`);
}

function runScript(cwd: string, args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [SCRIPT_PATH, ...args], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? "", exitCode: e.status ?? 1 };
  }
}

function readPointer(dir: string): Record<string, unknown> | null {
  const path = join(dir, POINTER_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

describe("set-active-plan.mjs (R3 writer)", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
    }
  });

  // R3.AC1/AC2 — plan approve 时写入指针,含完整字段
  it("writes active-plan.json with plan_path/spec_ref/phase/pinned_at on set", () => {
    tempDir = createTempForge();
    writePlan(
      tempDir,
      "feature-x.md",
      'status: approved\nspec_ref: ".tinkerman/specs/feature-x/spec.md"',
      "Plan body",
    );
    const planPath = ".tinkerman/plans/feature-x.md";

    const { exitCode } = runScript(tempDir, [planPath]);
    expect(exitCode).toBe(0);

    const pointer = readPointer(tempDir);
    expect(pointer).not.toBeNull();
    expect(pointer!.plan_path).toBe(planPath);
    expect(pointer!.spec_ref).toBe(".tinkerman/specs/feature-x/spec.md");
    expect(pointer!.phase).toBe("build");
    expect(pointer!.pinned_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  // R3.AC2 — 从 plan frontmatter 提取 spec_ref(若未显式传)
  it("derives spec_ref from plan frontmatter when not passed explicitly", () => {
    tempDir = createTempForge();
    writePlan(
      tempDir,
      "feature-y.md",
      'status: approved\nspec_ref: ".tinkerman/specs/feature-y/spec.md"',
      "Body",
    );

    runScript(tempDir, [".tinkerman/plans/feature-y.md"]);
    const pointer = readPointer(tempDir);
    expect(pointer!.spec_ref).toBe(".tinkerman/specs/feature-y/spec.md");
  });

  // R3.AC2 — build 启动 / 阶段切换时只更新 phase(保留其他字段)
  it("updates only phase field when --phase flag passed (preserves plan_path)", () => {
    tempDir = createTempForge();
    writePlan(tempDir, "feature-x.md", "status: approved", "Body");
    // 先写入完整指针
    runScript(tempDir, [".tinkerman/plans/feature-x.md"]);
    // 阶段切换到 review
    const { exitCode } = runScript(tempDir, ["--phase", "review"]);
    expect(exitCode).toBe(0);

    const pointer = readPointer(tempDir);
    expect(pointer!.plan_path).toBe(".tinkerman/plans/feature-x.md");
    expect(pointer!.phase).toBe("review");
  });

  // 安全:拒绝写不存在的 plan 路径(fail-open,不写垃圾指针)
  it("refuses to set pointer for a non-existent plan path", () => {
    tempDir = createTempForge();
    const { exitCode } = runScript(tempDir, [".tinkerman/plans/nonexistent.md"]);
    expect(exitCode).toBe(0); // fail-open exit 0
    expect(readPointer(tempDir)).toBeNull();
  });

  // P3-1 fix: 拒绝目录作为 plan_path(传 .tinkerman/plans 本身应被拒)
  it("refuses a directory as plan_path (must be a file inside .tinkerman/plans/)", () => {
    tempDir = createTempForge();
    writePlan(tempDir, "real.md", "status: approved", "Body");
    // 传 plans 目录本身(rel === "" 即 target == root)
    const { exitCode } = runScript(tempDir, [".tinkerman/plans"]);
    expect(exitCode).toBe(0);
    expect(readPointer(tempDir)).toBeNull();
  });

  // 安全:realpath 校验——拒绝 plans 目录外的路径
  it("refuses plan_path outside .tinkerman/plans/ (path traversal guard)", () => {
    tempDir = createTempForge();
    // 在 tempDir 外写个文件
    const outside = mkdtempSync(join(tmpdir(), "forge-outside-"));
    writeFileSync(join(outside, "evil.md"), "evil");
    const { exitCode } = runScript(tempDir, [`${join(outside, "evil.md")}`]);
    expect(exitCode).toBe(0);
    expect(readPointer(tempDir)).toBeNull();
    rmSync(outside, { recursive: true, force: true });
  });

  // --phase 更新时若无现有指针,静默跳过(fail-open)
  it("silently skips --phase update when no existing pointer exists", () => {
    tempDir = createTempForge();
    const { exitCode } = runScript(tempDir, ["--phase", "test"]);
    expect(exitCode).toBe(0);
    expect(readPointer(tempDir)).toBeNull();
  });

  // 幂等:重复 set 同一 plan 不产生重复/错误
  it("is idempotent — setting same plan twice yields single valid pointer", () => {
    tempDir = createTempForge();
    writePlan(tempDir, "feature-x.md", "status: approved", "Body");
    runScript(tempDir, [".tinkerman/plans/feature-x.md"]);
    runScript(tempDir, [".tinkerman/plans/feature-x.md"]);

    const pointer = readPointer(tempDir);
    expect(pointer).not.toBeNull();
    expect(pointer!.plan_path).toBe(".tinkerman/plans/feature-x.md");
  });

  // --help(black-box convention §2.8)
  it("exits 0 and prints usage on --help", () => {
    tempDir = createTempForge();
    const { stdout, exitCode } = runScript(tempDir, ["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/usage|set-active-plan|plan_path/i);
  });
});
