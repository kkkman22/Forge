import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { COMMENT_CHANNEL_DEFAULTS, parseCommentChannelConfig, } from "../../src/review-comment-bitbucket/config.js";
describe("Property: defaults fill missing fields", () => {
    it("any partial config resolves to full defaults for missing fields", { timeout: 30000 }, () => {
        const partialArb = fc.record({
            enabled: fc.boolean(),
            platform: fc.constant("bitbucket"),
            platform_override: fc.constantFrom("auto", "bitbucket", "none"),
            p0_p1_strategy: fc.constantFrom("both", "pr-task", "inline-only"),
            p2_strategy: fc.constantFrom("inline", "none"),
            p3_strategy: fc.constant("none"),
            request_changes_on_p0_p1: fc.boolean(),
            auto_reconcile_resolved: fc.boolean(),
            auto_reopen_regressed: fc.boolean(),
            comment_marker_prefix: fc.stringMatching(/^[\w-]+$/),
            rate_limit_interval_ms: fc.integer({ min: 0, max: 10000 }),
        }, { requiredKeys: [] });
        fc.assert(fc.property(partialArb, (partial) => {
            const result = parseCommentChannelConfig(partial);
            for (const [key, defaultVal] of Object.entries(COMMENT_CHANNEL_DEFAULTS)) {
                if (!(key in partial) || partial[key] === undefined) {
                    expect(result[key]).toEqual(defaultVal);
                }
            }
        }));
    });
    it("rate_limit_interval_ms outside [0,10000] throws", { timeout: 30000 }, () => {
        const badMsArb = fc.integer().filter((n) => n < 0 || n > 10000);
        fc.assert(fc.property(badMsArb, (ms) => {
            expect(() => parseCommentChannelConfig({ rate_limit_interval_ms: ms })).toThrow();
        }));
    });
});
describe("Unit: platform != bitbucket throws", () => {
    it("throws with non-bitbucket platform", () => {
        expect(() => parseCommentChannelConfig({ platform: "github" })).toThrow(/platform/);
    });
});
describe("Unit: p3_strategy != none throws", () => {
    it("throws with inline p3_strategy", () => {
        expect(() => parseCommentChannelConfig({ p3_strategy: "inline" })).toThrow(/p3_strategy/);
    });
});
describe("Unit: invalid platform_override throws", () => {
    it("throws with unknown override value", () => {
        expect(() => parseCommentChannelConfig({ platform_override: "force" })).toThrow(/platform_override/);
    });
});
describe("Unit: invalid comment_marker_prefix throws", () => {
    it("throws with prefix containing spaces", () => {
        expect(() => parseCommentChannelConfig({ comment_marker_prefix: "bad prefix" })).toThrow(/comment_marker_prefix/);
    });
});
describe("Unit: rate_limit_interval_ms out of range throws", () => {
    it("negative throws", () => {
        expect(() => parseCommentChannelConfig({ rate_limit_interval_ms: -1 })).toThrow(/rate_limit_interval_ms/);
    });
    it("> 10000 throws", () => {
        expect(() => parseCommentChannelConfig({ rate_limit_interval_ms: 10001 })).toThrow(/rate_limit_interval_ms/);
    });
});
describe("Unit: completely missing section gives all defaults", () => {
    it("parseCommentChannelConfig() returns defaults", () => {
        const result = parseCommentChannelConfig();
        expect(result).toEqual(COMMENT_CHANNEL_DEFAULTS);
    });
});
describe("Unit: missing BITBUCKET_BASE_URL does not throw at config parse", () => {
    it("config parsing succeeds without env var", () => {
        const origEnv = process.env.BITBUCKET_BASE_URL;
        delete process.env.BITBUCKET_BASE_URL;
        try {
            const result = parseCommentChannelConfig();
            expect(result.enabled).toBe(false);
        }
        finally {
            if (origEnv !== undefined)
                process.env.BITBUCKET_BASE_URL = origEnv;
        }
    });
});
describe("Unit: error message has prefix", () => {
    it("invalid config error includes 'Invalid review.comment_channel:'", () => {
        try {
            parseCommentChannelConfig({ platform: "github" });
        }
        catch (e) {
            expect(e.message).toContain("Invalid review.comment_channel:");
            return;
        }
        expect.unreachable("Should have thrown");
    });
});
//# sourceMappingURL=config.test.js.map