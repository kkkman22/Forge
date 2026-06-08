import { describe, expect, it } from "vitest";
import { clearPackageFields, extractPackageFields, writePackageFields, } from "../src/status-file-ext.js";
describe("package status fields", () => {
    it("round-trips package fields while preserving existing frontmatter", () => {
        const original = "---\ncurrent_task: demo\nphase: build\nloop_run_id: loop-1\n---\n# Status\n";
        const updated = writePackageFields(original, {
            currentPackage: "P2",
            completedPackages: ["P1"],
            nextPackage: "P3",
            packageCount: 3,
        });
        expect(updated).toContain('current_package: "P2"');
        expect(updated).toContain('completed_packages: "P1"');
        expect(updated).toContain('next_package: "P3"');
        expect(updated).toContain("package_count: 3");
        expect(updated).toContain("loop_run_id: loop-1");
        expect(extractPackageFields(updated)).toEqual({
            currentPackage: "P2",
            completedPackages: ["P1"],
            nextPackage: "P3",
            packageCount: 3,
        });
    });
    it("clears package fields without clearing loop fields", () => {
        const updated = clearPackageFields('---\nmode: "autonomous"\ncurrent_package: "P1"\ncompleted_packages: "P0"\nnext_package: "P2"\npackage_count: 2\n---\nbody\n');
        expect(updated).toContain('mode: "autonomous"');
        expect(updated).not.toContain("current_package");
        expect(updated).not.toContain("completed_packages");
        expect(updated).not.toContain("next_package");
        expect(updated).not.toContain("package_count");
    });
});
//# sourceMappingURL=status-file-ext-package.test.js.map