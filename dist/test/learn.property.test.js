/**
 * Property tests for the Learn engine (Properties 13, 14).
 *
 * Property 13: 知识文档格式有效性
 *   - YAML frontmatter must contain: title, tags, date, confidence
 *   - confidence must be in [0.3, 0.9] range
 *   **Validates: Requirements 9.2, 9.3**
 *
 * Property 14: 知识库维护不变量
 *   - After maintenance: doc count ≤ limit (default 20)
 *   - After maintenance: no instinct pattern with confidence < 0.3
 *   **Validates: Requirements 9.4, 9.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_KNOWLEDGE_LIMIT, generateKnowledgeDocument, MAX_CONFIDENCE, MIN_CONFIDENCE, maintainKnowledgeBase, validateKnowledgeFrontmatter, } from "../src/learn.js";
// ---------------------------------------------------------------------------
// Generators — Property 13: Knowledge document frontmatter
// ---------------------------------------------------------------------------
/** A valid date string in YYYY-MM-DD format. */
const dateArb = fc
    .tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
    .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
/** A valid confidence value in [0.3, 0.9]. */
const validConfidenceArb = fc
    .double({ min: MIN_CONFIDENCE, max: MAX_CONFIDENCE, noNaN: true })
    .map((v) => Math.round(v * 100) / 100);
/** A non-empty tag string. */
const tagArb = fc
    .string({ minLength: 2, maxLength: 15 })
    .map((s) => s.replace(/[^a-z-]/gi, "a").toLowerCase())
    .filter((s) => s.length >= 2);
/** A non-empty tags array. */
const tagsArb = fc.array(tagArb, { minLength: 1, maxLength: 5 });
/** A non-empty title string. */
const titleArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0);
/** A valid knowledge frontmatter. */
const validFrontmatterArb = fc
    .tuple(titleArb, tagsArb, dateArb, validConfidenceArb)
    .map(([title, tags, date, confidence]) => ({ title, tags, date, confidence }));
/** A knowledge document body. */
const bodyArb = fc
    .tuple(fc.string({ minLength: 1, maxLength: 50 }), fc.string({ minLength: 1, maxLength: 50 }), fc.string({ minLength: 1, maxLength: 50 }), fc.string({ minLength: 1, maxLength: 50 }), fc.string({ minLength: 1, maxLength: 50 }))
    .map(([problemPattern, solution, pitfalls, decisionRationale, reusablePatterns]) => ({
    problemPattern,
    solution,
    pitfalls,
    decisionRationale,
    reusablePatterns,
}));
/** A valid knowledge document. */
const validDocumentArb = fc
    .tuple(validFrontmatterArb, bodyArb)
    .map(([frontmatter, body]) => ({ frontmatter, body }));
// ---------------------------------------------------------------------------
// Generators — Property 14: Knowledge base state
// ---------------------------------------------------------------------------
/** An instinct pattern with valid confidence (≥ 0.3). */
const validPatternArb = fc
    .tuple(fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0), validConfidenceArb, tagsArb, fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }), fc.string({ minLength: 1, maxLength: 50 }))
    .map(([name, confidenceScore, tags, sources, description]) => ({
    name,
    confidenceScore,
    tags,
    sources,
    description,
}));
/** An instinct pattern with low confidence (< 0.3). */
const lowConfidencePatternArb = fc
    .tuple(fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0), fc.double({ min: 0.0, max: 0.29, noNaN: true }).map((v) => Math.round(v * 100) / 100), tagsArb, fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }), fc.string({ minLength: 1, maxLength: 50 }))
    .map(([name, confidenceScore, tags, sources, description]) => ({
    name,
    confidenceScore,
    tags,
    sources,
    description,
}));
/** A knowledge base state within limits (no maintenance needed). */
const withinLimitsStateArb = fc
    .tuple(fc.array(validDocumentArb, { minLength: 0, maxLength: 20 }), fc.array(validPatternArb, { minLength: 0, maxLength: 10 }), fc.constant(DEFAULT_KNOWLEDGE_LIMIT))
    .map(([documents, instinctPatterns, limit]) => ({ documents, instinctPatterns, limit }));
/** A knowledge base state that exceeds the document limit. */
const overLimitStateArb = fc
    .tuple(fc.integer({ min: 1, max: 10 }), fc.array(validPatternArb, { minLength: 0, maxLength: 5 }))
    .chain(([limit, instinctPatterns]) => fc
    .array(validDocumentArb, { minLength: limit + 1, maxLength: limit + 10 })
    .map((documents) => ({ documents, instinctPatterns, limit })));
/** A knowledge base state with some low-confidence patterns. */
const stateWithLowConfidencePatternsArb = fc
    .tuple(fc.array(validDocumentArb, { minLength: 0, maxLength: 10 }), fc.array(validPatternArb, { minLength: 0, maxLength: 5 }), fc.array(lowConfidencePatternArb, { minLength: 1, maxLength: 5 }), fc.constant(DEFAULT_KNOWLEDGE_LIMIT))
    .map(([documents, validPatterns, lowPatterns, limit]) => ({
    documents,
    instinctPatterns: [...validPatterns, ...lowPatterns],
    limit,
}));
/** Any knowledge base state (may or may not need maintenance). */
const anyKnowledgeBaseStateArb = fc
    .tuple(fc.array(validDocumentArb, { minLength: 0, maxLength: 30 }), fc.oneof(fc.array(validPatternArb, { minLength: 0, maxLength: 5 }), fc
    .tuple(fc.array(validPatternArb, { minLength: 0, maxLength: 3 }), fc.array(lowConfidencePatternArb, { minLength: 0, maxLength: 3 }))
    .map(([v, l]) => [...v, ...l])), fc.integer({ min: 1, max: 30 }))
    .map(([documents, instinctPatterns, limit]) => ({ documents, instinctPatterns, limit }));
// ---------------------------------------------------------------------------
// Property 13: 知识文档格式有效性
// ---------------------------------------------------------------------------
describe("Property 13: 知识文档格式有效性", () => {
    it("valid frontmatter passes validation (Req 9.2)", () => {
        fc.assert(fc.property(validFrontmatterArb, (frontmatter) => {
            const result = validateKnowledgeFrontmatter(frontmatter);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        }), { numRuns: 50 });
    });
    it("generated documents always have valid frontmatter (Req 9.2, 9.3)", () => {
        fc.assert(fc.property(titleArb, tagsArb, dateArb, fc.double({ min: -1, max: 2, noNaN: true }), bodyArb, (title, tags, date, rawConfidence, body) => {
            const doc = generateKnowledgeDocument(title, tags, date, rawConfidence, body);
            const result = validateKnowledgeFrontmatter(doc.frontmatter);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        }), { numRuns: 50 });
    });
    it("confidence is always clamped to [0.3, 0.9] range (Req 9.3)", () => {
        fc.assert(fc.property(titleArb, tagsArb, dateArb, fc.double({ min: -10, max: 10, noNaN: true }), bodyArb, (title, tags, date, rawConfidence, body) => {
            const doc = generateKnowledgeDocument(title, tags, date, rawConfidence, body);
            expect(doc.frontmatter.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
            expect(doc.frontmatter.confidence).toBeLessThanOrEqual(MAX_CONFIDENCE);
        }), { numRuns: 50 });
    });
    it("frontmatter contains all required fields (Req 9.2)", () => {
        fc.assert(fc.property(validDocumentArb, (doc) => {
            const fm = doc.frontmatter;
            // All required fields exist and are non-empty
            expect(typeof fm.title).toBe("string");
            expect(fm.title.trim().length).toBeGreaterThan(0);
            expect(Array.isArray(fm.tags)).toBe(true);
            expect(fm.tags.length).toBeGreaterThan(0);
            expect(typeof fm.date).toBe("string");
            expect(fm.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(typeof fm.confidence).toBe("number");
            expect(fm.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
            expect(fm.confidence).toBeLessThanOrEqual(MAX_CONFIDENCE);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 14: 知识库维护不变量
// ---------------------------------------------------------------------------
describe("Property 14: 知识库维护不变量", () => {
    it("after maintenance, doc count ≤ limit (Req 9.4)", () => {
        fc.assert(fc.property(anyKnowledgeBaseStateArb, (state) => {
            const result = maintainKnowledgeBase(state);
            expect(result.documents.length).toBeLessThanOrEqual(state.limit);
        }), { numRuns: 50 });
    });
    it("after maintenance, no instinct pattern has confidence < 0.3 (Req 9.5)", () => {
        fc.assert(fc.property(anyKnowledgeBaseStateArb, (state) => {
            const result = maintainKnowledgeBase(state);
            for (const pattern of result.instinctPatterns) {
                expect(pattern.confidenceScore).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
            }
        }), { numRuns: 50 });
    });
    it("over-limit state is trimmed to exactly the limit (Req 9.4)", () => {
        fc.assert(fc.property(overLimitStateArb, (state) => {
            const result = maintainKnowledgeBase(state);
            expect(result.documents.length).toBe(state.limit);
            expect(result.removedDocuments.length).toBe(state.documents.length - state.limit);
        }), { numRuns: 50 });
    });
    it("low-confidence patterns are removed during maintenance (Req 9.5)", () => {
        fc.assert(fc.property(stateWithLowConfidencePatternsArb, (state) => {
            const lowCount = state.instinctPatterns.filter((p) => p.confidenceScore < MIN_CONFIDENCE).length;
            const result = maintainKnowledgeBase(state);
            expect(result.removedPatterns.length).toBe(lowCount);
            for (const pattern of result.instinctPatterns) {
                expect(pattern.confidenceScore).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
            }
        }), { numRuns: 50 });
    });
    it("within-limits state is unchanged after maintenance (Req 9.4, 9.5)", () => {
        fc.assert(fc.property(withinLimitsStateArb, (state) => {
            const result = maintainKnowledgeBase(state);
            expect(result.documents.length).toBe(state.documents.length);
            expect(result.instinctPatterns.length).toBe(state.instinctPatterns.length);
            expect(result.removedDocuments).toHaveLength(0);
            expect(result.removedPatterns).toHaveLength(0);
        }), { numRuns: 50 });
    });
    it("removed documents have lowest confidence values (Req 9.4)", () => {
        fc.assert(fc.property(overLimitStateArb, (state) => {
            const result = maintainKnowledgeBase(state);
            if (result.removedDocuments.length > 0 && result.documents.length > 0) {
                const maxRemovedConfidence = Math.max(...result.removedDocuments.map((d) => d.frontmatter.confidence));
                const minKeptConfidence = Math.min(...result.documents.map((d) => d.frontmatter.confidence));
                expect(maxRemovedConfidence).toBeLessThanOrEqual(minKeptConfidence);
            }
        }), { numRuns: 50 });
    });
    it("both invariants hold simultaneously for any state", () => {
        fc.assert(fc.property(anyKnowledgeBaseStateArb, (state) => {
            const result = maintainKnowledgeBase(state);
            // Invariant 1: doc count ≤ limit
            expect(result.documents.length).toBeLessThanOrEqual(state.limit);
            // Invariant 2: no low-confidence patterns
            for (const pattern of result.instinctPatterns) {
                expect(pattern.confidenceScore).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
            }
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=learn.property.test.js.map