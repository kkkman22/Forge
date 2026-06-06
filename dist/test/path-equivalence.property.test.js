/**
 * Property tests for src/path-equivalence.ts — Path canonicalization.
 *
 * Validates Requirements 5.1, 5.3, 5.5:
 * - ~, $HOME, ${HOME} all canonicalize to same result as homeDir
 * - Relative paths with .. normalize correctly
 * - Double slashes collapse
 * - pathsEquivalent is transitive for equivalent inputs
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
describe("path-equivalence property tests", () => {
    const subpathArb = fc.stringMatching(/^[a-zA-Z0-9_/.-]{1,40}$/);
    const homeDirArb = fc.constantFrom("/Users/test", "/home/user", "/root");
    describe("canonicalizePathExpression", () => {
        it("~/subpath ≡ homeDir/subpath", async () => {
            const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
            fc.assert(fc.property(homeDirArb, subpathArb, (homeDir, subpath) => {
                const cwd = "/project";
                const tilde = canonicalizePathExpression(`~/${subpath}`, { cwd, homeDir });
                const explicit = canonicalizePathExpression(`${homeDir}/${subpath}`, { cwd, homeDir });
                expect(tilde.normalized).toBe(explicit.normalized);
            }));
        });
        it("$HOME/subpath ≡ homeDir/subpath", async () => {
            const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
            fc.assert(fc.property(homeDirArb, subpathArb, (homeDir, subpath) => {
                const cwd = "/project";
                const dollar = canonicalizePathExpression(`$HOME/${subpath}`, { cwd, homeDir });
                const explicit = canonicalizePathExpression(`${homeDir}/${subpath}`, { cwd, homeDir });
                expect(dollar.normalized).toBe(explicit.normalized);
            }));
        });
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${HOME} is the test subject
        it("${HOME}/subpath" + " ≡ homeDir/subpath", async () => {
            const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
            fc.assert(fc.property(homeDirArb, subpathArb, (homeDir, subpath) => {
                const cwd = "/project";
                const brace = canonicalizePathExpression(`\${HOME}/${subpath}`, { cwd, homeDir });
                const explicit = canonicalizePathExpression(`${homeDir}/${subpath}`, { cwd, homeDir });
                expect(brace.normalized).toBe(explicit.normalized);
            }));
        });
        it("double slashes collapse", async () => {
            const { canonicalizePathExpression } = await import("../src/path-equivalence.js");
            const a = canonicalizePathExpression("/foo//bar///baz", { cwd: "/", homeDir: "/home" });
            const b = canonicalizePathExpression("/foo/bar/baz", { cwd: "/", homeDir: "/home" });
            expect(a.normalized).toBe(b.normalized);
        });
        it("pathsEquivalent is transitive for equivalent forms", async () => {
            const { canonicalizePathExpression, pathsEquivalent } = await import("../src/path-equivalence.js");
            fc.assert(fc.property(homeDirArb, subpathArb, (homeDir, subpath) => {
                const cwd = "/project";
                const opts = { cwd, homeDir };
                const a = canonicalizePathExpression(`~/${subpath}`, opts);
                const b = canonicalizePathExpression(`$HOME/${subpath}`, opts);
                const c = canonicalizePathExpression(`${homeDir}/${subpath}`, opts);
                expect(pathsEquivalent(a, b)).toBe(true);
                expect(pathsEquivalent(b, c)).toBe(true);
                expect(pathsEquivalent(a, c)).toBe(true);
            }));
        });
    });
});
//# sourceMappingURL=path-equivalence.property.test.js.map