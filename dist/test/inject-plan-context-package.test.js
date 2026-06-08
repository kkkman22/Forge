import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const SCRIPT_PATH = join(process.cwd(), "scripts", "inject-plan-context.mjs");
function runScript(cwd) {
    try {
        return execFileSync("node", [SCRIPT_PATH], {
            cwd,
            encoding: "utf-8",
            timeout: 5000,
            input: JSON.stringify({ session_id: "s-main", hook_event_name: "PreToolUse" }),
        });
    }
    catch {
        return "";
    }
}
describe("inject-plan-context package awareness", () => {
    let tempDir = "";
    afterEach(() => {
        if (tempDir)
            rmSync(tempDir, { recursive: true, force: true });
    });
    it("infers build phase and current package from status when --phase is omitted", () => {
        tempDir = mkdtempSync(join(tmpdir(), "forge-plan-package-"));
        mkdirSync(join(tempDir, ".forge", "plans"), { recursive: true });
        mkdirSync(join(tempDir, ".forge"), { recursive: true });
        writeFileSync(join(tempDir, ".forge", "status.md"), '---\nphase: "build"\ncurrent_package: "P2"\ncompleted_packages: "P1"\nnext_package: "P3"\n---\n');
        writeFileSync(join(tempDir, ".forge", "plans", "pkg.md"), `---\nstatus: approved\n---\n\n## Execution Packages\n\n\`\`\`json\n{"execution_packages":[{"id":"P1","tasks":["T-01"]},{"id":"P2","tasks":["T-02","T-03"]},{"id":"P3","tasks":["T-04"]}]}\n\`\`\`\n\n## Tasks\n\n### T-01 Done\n- [x] done\n### T-02 Current\n- [ ] current task\n### T-03 Current 2\n- [ ] current task 2\n### T-04 Later\n- [ ] later task\n`);
        const output = runScript(tempDir);
        expect(output).toContain("[phase: build package: P2]");
        expect(output).toContain("T-02");
        expect(output).toContain("T-03");
        expect(output).not.toContain("T-01");
        expect(output).not.toContain("T-04");
    });
});
//# sourceMappingURL=inject-plan-context-package.test.js.map