/**
 * Property tests for sandbox-policy.ts
 *
 * Correctness Properties:
 *   P1: Deny always overrides allow for matching paths
 *   P2: Default policy denies paths outside project root
 *   P3: Network "none" mode denies all endpoints
 *
 * **Validates: Requirements 1.2, 5.1, 5.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDefaultPolicy, checkFileAccess, checkNetworkAccess, } from "../src/sandbox-policy.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Non-empty alphanumeric string segments for paths. */
const pathSegmentArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s));
/** File paths with 1-5 segments separated by /. */
const filePathArb = fc
    .array(pathSegmentArb, { minLength: 1, maxLength: 5 })
    .map((segments) => segments.join("/"));
/** Glob patterns: prefix + double-star + suffix. */
const globPatternArb = fc.constantFrom("src/**", "test/**", "**/*.ts", "**");
/** Network endpoints: domain:port. */
const domainArb = fc
    .tuple(fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)), fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)))
    .map(([a, b]) => `${a}.${b}.com`);
const endpointArb = fc
    .tuple(domainArb, fc.integer({ min: 1, max: 65535 }))
    .map(([domain, port]) => `${domain}:${port}`);
// ---------------------------------------------------------------------------
// Property 1: Deny overrides allow
// ---------------------------------------------------------------------------
describe("Property 1: deny overrides allow", () => {
    it("for any path matching both allow and deny, result is denied", () => {
        fc.assert(fc.property(filePathArb, (filePath) => {
            const policy = {
                allow: ["**"],
                deny: ["**"],
            };
            const result = checkFileAccess(filePath, policy);
            expect(result.allowed).toBe(false);
        }), { numRuns: 50 });
    });
    it("deny pattern overrides broader allow pattern for specific file", () => {
        fc.assert(fc.property(filePathArb, globPatternArb, (filePath, allowPattern) => {
            const policy = {
                allow: [allowPattern],
                deny: [filePath],
            };
            const result = checkFileAccess(filePath, policy);
            expect(result.allowed).toBe(false);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 2: Default policy denies paths outside project root
// ---------------------------------------------------------------------------
describe("Property 2: default policy security", () => {
    it("denies any path not under project root", () => {
        const projectRoot = "/projects/my-app";
        const policy = buildDefaultPolicy(projectRoot);
        fc.assert(fc.property(filePathArb, (filePath) => {
            // Ensure the path does NOT start with the project root
            const fullPath = `/other/${filePath}`;
            fc.pre(!fullPath.startsWith(projectRoot));
            const result = checkFileAccess(fullPath, policy.fileSystem);
            expect(result.allowed).toBe(false);
        }), { numRuns: 50 });
    });
    it("allows any path under project root", () => {
        const projectRoot = "/projects/my-app";
        const policy = buildDefaultPolicy(projectRoot);
        fc.assert(fc.property(filePathArb, (filePath) => {
            const fullPath = `${projectRoot}/${filePath}`;
            const result = checkFileAccess(fullPath, policy.fileSystem);
            expect(result.allowed).toBe(true);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 3: Network "none" mode denies all endpoints
// ---------------------------------------------------------------------------
describe("Property 3: network none mode denies all", () => {
    it("for any endpoint, none mode returns denied", () => {
        const policy = { mode: "none" };
        fc.assert(fc.property(endpointArb, (endpoint) => {
            const result = checkNetworkAccess(endpoint, policy);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain("none");
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=sandbox-policy.property.test.js.map