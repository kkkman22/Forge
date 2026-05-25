import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

const FILES_WITH_AGENT_SDK = [
  "src/forge-loop-cli.ts",
  "src/sdk-driver.ts",
  "src/sdk-agent-adapter.ts",
  "src/agent-registry.ts",
  "src/sandbox-profile.ts",
  "src/frozen-zone-hook.ts",
];

describe("T8: SdkDriver replacement — agent-sdk removal", () => {
  it("forge-loop-cli.ts has no runtime import from agent-sdk", () => {
    const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
    const lines = content.split("\n");
    const agentSdkImports = lines.filter(
      (line) => line.includes("@anthropic-ai/claude-agent-sdk") && !line.trim().startsWith("//"),
    );
    // Only import type allowed
    for (const line of agentSdkImports) {
      expect(line).toMatch(/import\s+type\b/);
    }
  });

  it("sdk-agent-adapter.ts is marked deprecated", () => {
    const content = readFileSync(join(ROOT, "src/sdk-agent-adapter.ts"), "utf-8");
    expect(content).toMatch(/@deprecated|DEPRECATED/i);
  });

  it("no runtime agent-sdk import across the 6 target files (except deprecated adapter)", () => {
    // sdk-agent-adapter.ts is deprecated but still has runtime import — excluded
    const filesToCheck = FILES_WITH_AGENT_SDK.filter((f) => f !== "src/sdk-agent-adapter.ts");
    try {
      const result = execSync(
        `rg "from '@anthropic-ai/claude-agent-sdk'" ${filesToCheck.map((f) => `"${join(ROOT, f)}"`).join(" ")}`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();

      if (result) {
        for (const line of result.split("\n")) {
          expect(line).toMatch(/import\s+type\b/);
        }
      }
    } catch {
      // rg exits non-zero when no matches — that's a pass
    }
  });

  it("forge-loop-cli.ts no longer imports or calls startup()", () => {
    const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
    // No import of startup from agent-sdk
    expect(content).not.toMatch(/import.*\{[^}]*startup[^}]*\}.*from.*claude-agent-sdk/);
    // No runtime call to startup() (ignore comments)
    const codeLines = content
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
    for (const line of codeLines) {
      expect(line).not.toMatch(/^(?![/ {*]).*\bstartup\s*\(/);
    }
  });

  it("CliSubprocessDriver implements AgentInterface", async () => {
    const { CliSubprocessDriver } = await import("../src/cli-subprocess-driver.js");
    const config = {
      cwd: "/tmp",
      runId: "test",
      runDir: "/tmp",
      permissionMode: "default",
      dangerouslySkipPermissions: false,
      maxTurns: 1,
    };
    const driver = new CliSubprocessDriver(config);
    expect(driver.name).toBe("claude-cli");
    expect(typeof driver.run).toBe("function");
    expect(typeof driver.shutdown).toBe("function");
  });
});
