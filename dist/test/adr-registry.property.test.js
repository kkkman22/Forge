/**
 * Property-based tests for the ADR Registry id-generation helper.
 *
 * Covers:
 *   - `nextAdrId([])` always returns the canonical first id `"ADR-0001"`
 *   - `nextAdrId(list)` always returns an id strictly greater than every
 *     valid existing id in `list` (strict monotonicity)
 *   - The output format is stable: always matches `/^ADR-\d{4}$/`
 *
 * **Validates: Requirements 1.1, 1.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applySupersession, nextAdrId, renderAdrIndex, } from "../src/adr-registry.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Generate a canonical ADR id string: "ADR-NNNN" with N in [0, 9999]. */
const adrIdArb = fc.integer({ min: 0, max: 9999 }).map((n) => `ADR-${String(n).padStart(4, "0")}`);
/** Build an AdrEntry with a given id and otherwise plausible fields. */
function entryWithId(id) {
    return {
        id,
        title: "t",
        status: "accepted",
        date: "2026-05-10",
        deciders: ["@a"],
        filePath: `${id}.md`,
    };
}
/** Generate a list of AdrEntry with canonical ids. */
const validEntryListArb = fc
    .array(adrIdArb, { minLength: 0, maxLength: 50 })
    .map((ids) => ids.map(entryWithId));
// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
describe("nextAdrId — property-based", () => {
    /**
     * **Validates: Requirements 1.1, 1.2**
     *
     * Empty input always returns the canonical first id.
     */
    it("empty input returns ADR-0001", () => {
        expect(nextAdrId([])).toBe("ADR-0001");
    });
    /**
     * **Validates: Requirements 1.1**
     *
     * For any list of valid AdrEntry (with canonical `ADR-NNNN` ids), the
     * returned id, interpreted as an integer, is strictly greater than every
     * existing id in the input. Since ids are fixed-width zero-padded, this
     * is equivalent to lexicographic ordering within the 4-digit range.
     */
    it("returns an id strictly greater than every existing valid id", () => {
        fc.assert(fc.property(validEntryListArb, (entries) => {
            // Constrain the max to 9998 to avoid overflow at the boundary: a
            // list containing ADR-9999 would push nextAdrId past the 4-digit
            // format, which is outside the contract.
            const filtered = entries.filter((e) => {
                const match = e.id.match(/^ADR-(\d{4})$/);
                if (match === null)
                    return true;
                return Number.parseInt(match[1], 10) <= 9998;
            });
            const next = nextAdrId(filtered);
            const nextNum = Number.parseInt(next.slice(4), 10);
            for (const entry of filtered) {
                const match = entry.id.match(/^ADR-(\d{4})$/);
                if (match === null)
                    continue;
                const existing = Number.parseInt(match[1], 10);
                expect(nextNum).toBeGreaterThan(existing);
            }
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 1.2**
     *
     * The output format is stable across all inputs: it always matches the
     * canonical `ADR-NNNN` 4-digit zero-padded pattern.
     */
    it("output always matches /^ADR-\\d{4}$/", () => {
        fc.assert(fc.property(validEntryListArb, (entries) => {
            // Cap at 9998 as above so the result fits in 4 digits.
            const filtered = entries.filter((e) => {
                const match = e.id.match(/^ADR-(\d{4})$/);
                if (match === null)
                    return true;
                return Number.parseInt(match[1], 10) <= 9998;
            });
            expect(nextAdrId(filtered)).toMatch(/^ADR-\d{4}$/);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 1.1**
     *
     * Appending the freshly generated id to the list and regenerating yields
     * a *new* id strictly greater than the previous one — demonstrating that
     * iterative ADR creation produces a strictly increasing sequence.
     */
    it("is strictly monotonic under iterative generation", () => {
        fc.assert(fc.property(validEntryListArb, (entries) => {
            const filtered = entries.filter((e) => {
                const match = e.id.match(/^ADR-(\d{4})$/);
                if (match === null)
                    return true;
                return Number.parseInt(match[1], 10) <= 9997;
            });
            const first = nextAdrId(filtered);
            const second = nextAdrId([...filtered, entryWithId(first)]);
            expect(Number.parseInt(second.slice(4), 10)).toBeGreaterThan(Number.parseInt(first.slice(4), 10));
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// renderAdrIndex properties
// ---------------------------------------------------------------------------
/** Generate an arbitrary `AdrEntry` with an arbitrary id and title. */
const entryArb = fc
    .record({
    id: adrIdArb,
    title: fc.string({ minLength: 1, maxLength: 80 }),
    status: fc.constantFrom("proposed", "accepted", "superseded", "deprecated"),
    date: fc.constant("2026-05-10"),
})
    .map(({ id, title, status, date }) => ({
    id,
    title,
    status: status,
    date,
    deciders: ["@a"],
    filePath: `${id}.md`,
}));
/** Generate a list of `AdrEntry` values with distinct ids. */
const uniqueEntryListArb = fc.uniqueArray(entryArb, {
    minLength: 0,
    maxLength: 30,
    selector: (e) => e.id,
});
describe("renderAdrIndex — property-based", () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * The rendered index contains every unique id from the input. We check
     * that for every input entry, its id appears at least once as the first
     * cell of some data row.
     */
    it("output contains every unique id from the input", () => {
        fc.assert(fc.property(uniqueEntryListArb, (entries) => {
            const out = renderAdrIndex(entries);
            for (const entry of entries) {
                // Match "| <id> |" so we don't accidentally find the id inside
                // a title or filePath that happens to contain ADR-NNNN.
                const needle = `| ${entry.id} |`;
                expect(out).toContain(needle);
            }
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 1.5**
     *
     * Data rows appear in ascending id order. Ids are fixed-width, so
     * lexicographic order coincides with numeric order.
     */
    it("data rows are sorted by id ascending", () => {
        fc.assert(fc.property(uniqueEntryListArb, (entries) => {
            const out = renderAdrIndex(entries);
            // Extract ids in the order they appear in the table. The header
            // row starts with "| ID |" which we exclude.
            const ids = [];
            for (const line of out.split("\n")) {
                const match = line.match(/^\|\s*(ADR-\d{4})\s*\|/);
                if (match)
                    ids.push(match[1]);
            }
            const sorted = [...ids].sort();
            expect(ids).toEqual(sorted);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 1.5**
     *
     * The function is pure: calling it twice on the same input yields the
     * same output.
     */
    it("is deterministic", () => {
        fc.assert(fc.property(uniqueEntryListArb, (entries) => {
            expect(renderAdrIndex(entries)).toBe(renderAdrIndex(entries));
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// applySupersession properties
// ---------------------------------------------------------------------------
describe("applySupersession — property-based", () => {
    /**
     * **Validates: Requirements 1.8**
     *
     * Reversibility / symmetry: if `newAdr.supersedes === old.id`, the
     * resulting update records a symmetric supersession relationship
     * (`old.superseded_by === newAdr.id` and `old.status === "superseded"`).
     * Applying `applySupersession` is therefore a well-defined transformation
     * whose effect on `old` can be reversed by reconstructing the original
     * status and clearing `superseded_by`.
     */
    it("produces a symmetric supersession relationship", () => {
        fc.assert(fc.property(uniqueEntryListArb, fc.integer({ min: 0, max: 29 }), entryArb, (baseEntries, targetIdx, newAdrBase) => {
            if (baseEntries.length === 0)
                return;
            const idx = targetIdx % baseEntries.length;
            const target = baseEntries[idx];
            // Ensure newAdr has a distinct id from every baseEntry so we
            // never accidentally collide.
            const usedIds = new Set(baseEntries.map((e) => e.id));
            let candidate = newAdrBase.id;
            let n = 0;
            while (usedIds.has(candidate)) {
                n += 1;
                candidate = `ADR-${String(9000 + n).padStart(4, "0")}`;
            }
            const newAdr = { ...newAdrBase, id: candidate, supersedes: target.id };
            const updates = applySupersession(newAdr, baseEntries);
            expect(updates).toHaveLength(1);
            expect(updates[0].id).toBe(target.id);
            expect(updates[0].status).toBe("superseded");
            expect(updates[0].superseded_by).toBe(newAdr.id);
            // Reversibility: reconstructing the original from the update
            // yields the original entry modulo the two touched fields.
            const reconstructed = {
                ...updates[0],
                status: target.status,
                superseded_by: target.superseded_by,
            };
            expect(reconstructed).toEqual(target);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 1.8**
     *
     * Minimality: the result includes only entries that actually needed
     * updating. When `supersedes` is not set, the result is empty; when it
     * points to a missing id, the result is also empty; when it matches
     * exactly one id, the result has length 1. Because input ids are unique,
     * there are no other cases.
     */
    it("returns only the entries that need updating", () => {
        fc.assert(fc.property(uniqueEntryListArb, entryArb, fc.option(adrIdArb, { nil: undefined }), (baseEntries, newAdrBase, maybeSupersedes) => {
            const usedIds = new Set(baseEntries.map((e) => e.id));
            let candidate = newAdrBase.id;
            let n = 0;
            while (usedIds.has(candidate)) {
                n += 1;
                candidate = `ADR-${String(9000 + n).padStart(4, "0")}`;
            }
            const newAdr = {
                ...newAdrBase,
                id: candidate,
                supersedes: maybeSupersedes,
            };
            const updates = applySupersession(newAdr, baseEntries);
            if (maybeSupersedes === undefined) {
                expect(updates).toEqual([]);
                return;
            }
            const matches = baseEntries.filter((e) => e.id === maybeSupersedes && e.id !== newAdr.id);
            expect(updates).toHaveLength(matches.length);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 1.8**
     *
     * Purity: the function does not mutate any input entry. We serialize
     * the inputs before and after the call and compare.
     */
    it("does not mutate its inputs", () => {
        fc.assert(fc.property(uniqueEntryListArb, entryArb, fc.option(adrIdArb, { nil: undefined }), (baseEntries, newAdrBase, maybeSupersedes) => {
            const newAdr = { ...newAdrBase, supersedes: maybeSupersedes };
            const beforeBase = JSON.stringify(baseEntries);
            const beforeNew = JSON.stringify(newAdr);
            applySupersession(newAdr, baseEntries);
            expect(JSON.stringify(baseEntries)).toBe(beforeBase);
            expect(JSON.stringify(newAdr)).toBe(beforeNew);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=adr-registry.property.test.js.map