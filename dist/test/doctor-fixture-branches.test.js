import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHealthSnapshot } from "../src/doctor.js";
let tmp;
beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "doctor-fixture-"));
    mkdirSync(join(tmp, ".forge"), { recursive: true });
});
afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});
function writeForge(rel, content) {
    const full = join(tmp, ".forge", rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf-8");
}
describe("buildHealthSnapshot (fixture-based branch coverage)", () => {
    it("returns unknown task when no status.md", () => {
        const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "head-1" });
        expect(snap.task.id).toBe("unknown");
        expect(snap.gates.status.status).toBe("unknown");
    });
    it("reads status + spec + plan + progress + artifacts", () => {
        writeForge("status.md", '---\ncurrent_task: "topic-a"\ntier: "standard"\nphase: "test"\n---\n');
        writeForge("specs/topic-a/requirements.md", '---\nstatus: "locked"\n---\n');
        writeForge("plans/topic-a.md", '---\nstatus: "approved"\n---\n');
        writeForge("progress/topic-a.md", "- [x] first\n- [ ] second\n");
        writeForge("config.md", "policy_profile: team\n");
        const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "head-1" });
        expect(snap.task.id).toBe("topic-a");
        expect(snap.task.phase).toBe("test");
        expect(snap.policyProfile).toBe("team");
    });
    it("reads enterprise profile config", () => {
        writeForge("status.md", '---\ncurrent_task: "x"\ntier: "full"\nphase: "build"\n---\n');
        writeForge("config.md", "policy_profile: enterprise\n");
        const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "head-1" });
        expect(snap.policyProfile).toBe("enterprise");
    });
    it("reads solo profile config", () => {
        writeForge("status.md", '---\ncurrent_task: "x"\ntier: "light"\nphase: "build"\n---\n');
        writeForge("config.md", "policy_profile: solo\n");
        const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "head-1" });
        expect(snap.policyProfile).toBe("solo");
    });
    it("reports runtimeSync fail when scripts missing", () => {
        writeForge("status.md", '---\ncurrent_task: "x"\ntier: "standard"\nphase: "build"\n---\n');
        const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "head-1" });
        expect(snap.runtimeSync.status).toBe("fail");
    });
    it("reports runtimeSync pass when worker scripts present", () => {
        writeForge("status.md", '---\ncurrent_task: "x"\ntier: "standard"\nphase: "build"\n---\n');
        for (const f of [
            "forge-hook-dispatch.mjs",
            "forge-phase-worker.mjs",
            "forge-sync-runtime.mjs",
        ]) {
            mkdirSync(join(tmp, "scripts"), { recursive: true });
            writeFileSync(join(tmp, "scripts", f), "// runtime\n");
        }
        const snap = buildHealthSnapshot({ projectRoot: tmp, currentHead: "head-1" });
        expect(snap.runtimeSync.status).toBe("pass");
    });
});
//# sourceMappingURL=doctor-fixture-branches.test.js.map