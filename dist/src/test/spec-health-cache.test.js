import { describe, expect, it } from "vitest";
import { computeBundleHash, computeSpecHash, parseHealthCache, shouldRecompute, } from "../src/spec-health.js";
describe("computeSpecHash", () => {
    it("returns consistent sha256 hex for same content", () => {
        const content = "Given a spec\nWhen run\nThen pass";
        expect(computeSpecHash(content)).toBe(computeSpecHash(content));
        expect(computeSpecHash(content)).toMatch(/^[0-9a-f]{64}$/);
    });
    it("returns different hash for different content", () => {
        expect(computeSpecHash("abc")).not.toBe(computeSpecHash("def"));
    });
});
describe("parseHealthCache", () => {
    it("returns null when no health field in frontmatter", () => {
        const fm = { status: "locked", topic: "test" };
        expect(parseHealthCache(fm)).toBeNull();
    });
    it("returns cached data when health field exists", () => {
        const fm = {
            status: "locked",
            topic: "test",
            health: { score: 0.9, verdict: "healthy", spec_hash: "abc123", generated_at: "2026-01-01" },
        };
        const cache = parseHealthCache(fm);
        expect(cache).not.toBeNull();
        expect(cache.specHash).toBe("abc123");
        expect(cache.score).toBe(0.9);
    });
    it("returns null for malformed health field (wrong types)", () => {
        const fm = {
            health: { score: "not-a-number", verdict: "healthy", spec_hash: "abc", generated_at: "2026" },
        };
        expect(parseHealthCache(fm)).toBeNull();
    });
    it("returns null for invalid verdict value", () => {
        const fm = {
            health: { score: 0.9, verdict: "invalid", spec_hash: "abc", generated_at: "2026" },
        };
        expect(parseHealthCache(fm)).toBeNull();
    });
    it("returns null when health is null", () => {
        expect(parseHealthCache({ health: null })).toBeNull();
    });
});
describe("shouldRecompute", () => {
    it("returns true when spec hash differs", () => {
        expect(shouldRecompute("hash_a", {
            specHash: "hash_b",
            score: 1.0,
            verdict: "healthy",
            generatedAt: "",
        })).toBe(true);
    });
    it("returns false when spec hash matches", () => {
        expect(shouldRecompute("hash_a", {
            specHash: "hash_a",
            score: 1.0,
            verdict: "healthy",
            generatedAt: "",
        })).toBe(false);
    });
    it("returns true when cache is null", () => {
        expect(shouldRecompute("hash_a", null)).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// computeBundleHash (T-09.6: three-file health check)
// ---------------------------------------------------------------------------
describe("computeBundleHash", () => {
    const legacyBundle = {
        feature: "test",
        kind: "feature",
        layout: "legacy-single",
        variant: "requirements-first",
        primary: {
            frontmatter: {
                feature: "test",
                status: "locked",
                date: "2026-05-23",
                workflow_variant: "requirements-first",
            },
            intro: "Test intro",
            glossary: [],
            userStories: [],
            earsCriteria: [],
            nonFunctional: [],
            outOfScope: [],
        },
    };
    const threeFileBundle = {
        feature: "auth",
        kind: "feature",
        layout: "three-file",
        variant: "requirements-first",
        primary: {
            frontmatter: {
                feature: "auth",
                status: "locked",
                date: "2026-05-23",
                workflow_variant: "requirements-first",
            },
            intro: "Auth intro",
            glossary: [],
            userStories: [],
            earsCriteria: [],
            nonFunctional: [],
            outOfScope: [],
        },
        design: {
            frontmatter: {
                feature: "auth",
                status: "locked",
                date: "2026-05-23",
                workflow_variant: "requirements-first",
            },
            overview: "Auth design",
            architecture: "",
            componentInterfaces: [],
            dataModel: "",
            errorHandling: "",
            testingStrategy: "",
            rollout: "",
            openQuestions: [],
        },
        tasks: {
            frontmatter: {
                feature: "auth",
                status: "locked",
                date: "2026-05-23",
                workflow_variant: "requirements-first",
            },
            tasks: [
                { id: "T-01", title: "Test", goal: "Do it", related_requirements: [], status: "pending" },
            ],
        },
    };
    it("returns stable hash for legacy-single bundle", () => {
        const hash1 = computeBundleHash(legacyBundle);
        const hash2 = computeBundleHash(legacyBundle);
        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });
    it("returns stable hash for three-file bundle", () => {
        const hash1 = computeBundleHash(threeFileBundle);
        const hash2 = computeBundleHash(threeFileBundle);
        expect(hash1).toBe(hash2);
    });
    it("produces different hashes for different bundles", () => {
        expect(computeBundleHash(legacyBundle)).not.toBe(computeBundleHash(threeFileBundle));
    });
    it("three-file hash changes when design is added/removed", () => {
        const bundleNoDesign = { ...threeFileBundle, design: undefined };
        expect(computeBundleHash(threeFileBundle)).not.toBe(computeBundleHash(bundleNoDesign));
    });
});
//# sourceMappingURL=spec-health-cache.test.js.map