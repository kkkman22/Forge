import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/inject-evolved-rules.mjs");

function makeTmp(): string {
  return mkdtempSync(join(ROOT, ".tmp-session-start-"));
}

function makeEvolvedRules(dir: string, content: string): void {
  const knowledgeDir = join(dir, ".tinkerman", "knowledge");
  mkdirSync(knowledgeDir, { recursive: true });
  writeFileSync(join(knowledgeDir, "evolved-rules.md"), content, "utf-8");
}

function makeSpecDir(dir: string, specName: string): void {
  const specsDir = join(dir, ".kiro", "specs", specName);
  mkdirSync(specsDir, { recursive: true });
  writeFileSync(join(specsDir, "spec.md"), `# ${specName}`, "utf-8");
}

function makeSpecLock(dir: string, specName: string): void {
  const stateDir = join(dir, ".tinkerman", "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "spec-lock"), specName, "utf-8");
}

/** Standard main-agent stdin input */
function mainInput(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    cwd: "",
    session_id: "test-session",
    hook_event_name: "SessionStart",
    resumed: false,
    ...overrides,
  });
}

/**
 * Spawn the hook script with stdin input and collect result.
 * Uses spawn + explicit stdin.write/end instead of execFile(input)
 * to avoid a Node.js timing issue where execFile's input option
 * causes the stdin pipe to not deliver data before the isTTY check.
 */
interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  elapsed: number;
}

function runScript(cwd: string, input: string): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn("node", [SCRIPT], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    child.stdin.write(input);
    child.stdin.end();

    child.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code,
        elapsed: Date.now() - start,
      });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

describe("SessionStart hook (inject-evolved-rules.mjs)", () => {
  describe("additionalContext output", () => {
    it("outputs additionalContext when evolved-rules.md exists", async () => {
      const tmpDir = makeTmp();
      try {
        makeEvolvedRules(tmpDir, "### R1: Test Rule\n**Content**: Some rule content.");

        const { stdout } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-123" }),
        );

        const json = JSON.parse(stdout.trim());
        expect(json.additionalContext).toContain("R1: Test Rule");
        expect(json.additionalContext).toContain("Some rule content");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("truncates additionalContext at 4KB boundary", async () => {
      const tmpDir = makeTmp();
      try {
        const longContent = "A".repeat(6000);
        makeEvolvedRules(tmpDir, longContent);

        const { stdout } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-456" }),
        );

        const json = JSON.parse(stdout.trim());
        expect(json.additionalContext.length).toBeLessThan(5000);
        expect(json.additionalContext.length).toBeGreaterThan(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("hookSpecificOutput", () => {
    it("outputs reloadSkills: true", async () => {
      const tmpDir = makeTmp();
      try {
        makeEvolvedRules(tmpDir, "### R1: Test");

        const { stdout } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-789" }),
        );

        const json = JSON.parse(stdout.trim());
        expect(json.hookSpecificOutput).toBeDefined();
        expect(json.hookSpecificOutput.reloadSkills).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("outputs sessionTitle from spec directory name", async () => {
      const tmpDir = makeTmp();
      try {
        makeEvolvedRules(tmpDir, "### R1: Test");
        makeSpecDir(tmpDir, "my-feature");

        const { stdout } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-title" }),
        );

        const json = JSON.parse(stdout.trim());
        expect(json.hookSpecificOutput.sessionTitle).toBe("Forge: my-feature");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("outputs sessionTitle from spec-lock when multiple specs exist", async () => {
      const tmpDir = makeTmp();
      try {
        makeEvolvedRules(tmpDir, "### R1: Test");
        makeSpecDir(tmpDir, "feature-a");
        makeSpecDir(tmpDir, "feature-b");
        makeSpecLock(tmpDir, "feature-b");

        const { stdout } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-lock" }),
        );

        const json = JSON.parse(stdout.trim());
        expect(json.hookSpecificOutput.sessionTitle).toBe("Forge: feature-b");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("omits sessionTitle when no spec exists", async () => {
      const tmpDir = makeTmp();
      try {
        makeEvolvedRules(tmpDir, "### R1: Test");

        const { stdout } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-no-spec" }),
        );

        const json = JSON.parse(stdout.trim());
        expect(json.hookSpecificOutput.reloadSkills).toBe(true);
        expect(
          json.hookSpecificOutput.sessionTitle === undefined ||
            json.hookSpecificOutput.sessionTitle === "",
        ).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("failure / edge cases", () => {
    it("exits 0 with empty output when evolved-rules.md does not exist", async () => {
      const tmpDir = makeTmp();
      try {
        const { stdout, exitCode } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-missing" }),
        );

        expect(exitCode).toBe(0);
        expect(stdout.trim()).toBe("");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("exits 0 (not error) when evolved-rules.md is missing", async () => {
      const tmpDir = makeTmp();
      try {
        const { exitCode } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-silent" }),
        );

        expect(exitCode).toBe(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("exits 0 silently for subagent callers", async () => {
      const tmpDir = makeTmp();
      try {
        makeEvolvedRules(tmpDir, "### R1: Should Not Appear");

        const { stdout, exitCode } = await runScript(
          tmpDir,
          JSON.stringify({
            cwd: tmpDir,
            session_id: "subagent-123",
            resumed: false,
            agent_id: "subagent-456",
          }),
        );

        expect(exitCode).toBe(0);
        expect(stdout.trim()).toBe("");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("completes within 500ms", async () => {
      const tmpDir = makeTmp();
      try {
        makeEvolvedRules(tmpDir, "### R1: Perf Test");

        const { elapsed } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-perf" }),
        );

        expect(elapsed).toBeLessThan(500);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("outputs valid JSON with all required fields", async () => {
      const tmpDir = makeTmp();
      try {
        makeEvolvedRules(tmpDir, "### R1: JSON Test\nContent here.");
        makeSpecDir(tmpDir, "json-spec");

        const { stdout } = await runScript(
          tmpDir,
          mainInput({ cwd: tmpDir, session_id: "test-json" }),
        );

        const json = JSON.parse(stdout.trim());
        expect(json).toHaveProperty("additionalContext");
        expect(json).toHaveProperty("hookSpecificOutput");
        expect(json.hookSpecificOutput).toHaveProperty("reloadSkills");
        expect(json.hookSpecificOutput).toHaveProperty("sessionTitle");
        expect(typeof json.additionalContext).toBe("string");
        expect(typeof json.hookSpecificOutput.reloadSkills).toBe("boolean");
        expect(typeof json.hookSpecificOutput.sessionTitle).toBe("string");
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
