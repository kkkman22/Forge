/**
 * Property 25: 并发写入保护（文件锁机制）
 *
 * Uses fast-check to verify that:
 *   - lockFilePath generates correct paths from .forge/ file paths
 *   - isLockStale correctly identifies expired locks
 *   - tryAcquireLock grants lock when no existing lock
 *   - tryAcquireLock grants lock when existing lock is stale
 *   - tryAcquireLock grants lock when same holder (re-entrant)
 *   - tryAcquireLock rejects when fresh lock held by another
 *   - serializeLockInfo / parseLockInfo round-trip correctly
 *   - createLockInfo produces valid lock info
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createLockInfo, DEFAULT_LOCK_TIMEOUT_MS, isLockStale, LOCK_DIR, lockFilePath, parseLockInfo, serializeLockInfo, tryAcquireLock, } from "../src/state.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const topicArb = fc
    .string({ minLength: 3, maxLength: 20 })
    .map((s) => s.replace(/[^a-z0-9-]/gi, "a").toLowerCase())
    .filter((s) => s.length >= 3 && /^[a-z]/.test(s));
const forgePathArb = fc.oneof(topicArb.map((t) => `progress/${t}.md`), topicArb.map((t) => `reviews/${t}.md`), topicArb.map((t) => `specs/${t}/spec.md`), topicArb.map((t) => `plans/${t}.md`), fc.constant("status.md"));
const holderArb = fc
    .string({ minLength: 1, maxLength: 30 })
    .map((s) => s.replace(/[\n\r]/g, "x"))
    .filter((s) => s.trim().length > 0);
const isoDateArb = fc
    .date({ min: new Date("2025-01-01T00:00:00Z"), max: new Date("2026-12-31T00:00:00Z") })
    .filter((d) => !Number.isNaN(d.getTime()))
    .map((d) => d.toISOString());
const lockInfoArb = fc
    .tuple(holderArb, isoDateArb, forgePathArb)
    .map(([holder, acquiredAt, targetFile]) => ({
    holder,
    acquiredAt,
    targetFile: targetFile.replace(/^\.forge\//, ""),
}));
// ---------------------------------------------------------------------------
// Property 25: Lock file path generation
// ---------------------------------------------------------------------------
describe("Property 25: Lock 文件路径生成", () => {
    it("lock file path is under LOCK_DIR", () => {
        fc.assert(fc.property(forgePathArb, (path) => {
            const result = lockFilePath(path);
            expect(result.startsWith(`${LOCK_DIR}/`)).toBe(true);
        }), { numRuns: 100 });
    });
    it("lock file path ends with .lock", () => {
        fc.assert(fc.property(forgePathArb, (path) => {
            const result = lockFilePath(path);
            expect(result.endsWith(".lock")).toBe(true);
        }), { numRuns: 100 });
    });
    it("lock file path contains no forward slashes after LOCK_DIR prefix", () => {
        fc.assert(fc.property(forgePathArb, (path) => {
            const result = lockFilePath(path);
            const afterPrefix = result.slice(LOCK_DIR.length + 1);
            expect(afterPrefix.includes("/")).toBe(false);
        }), { numRuns: 100 });
    });
    it("different forge paths produce different lock paths", () => {
        const a = lockFilePath("progress/topic-a.md");
        const b = lockFilePath("progress/topic-b.md");
        expect(a).not.toBe(b);
    });
    it(".forge/ prefix is stripped before generating lock path", () => {
        const withPrefix = lockFilePath(".forge/progress/topic.md");
        const withoutPrefix = lockFilePath("progress/topic.md");
        expect(withPrefix).toBe(withoutPrefix);
    });
    it("slashes are replaced with double underscores", () => {
        const result = lockFilePath("specs/feature/spec.md");
        expect(result).toBe(`${LOCK_DIR}/specs__feature__spec.md.lock`);
    });
});
// ---------------------------------------------------------------------------
// Property 25: Lock staleness detection
// ---------------------------------------------------------------------------
describe("Property 25: Lock 过期检测", () => {
    it("lock acquired just now is NOT stale", () => {
        fc.assert(fc.property(lockInfoArb, (info) => {
            const nowMs = new Date(info.acquiredAt).getTime();
            expect(isLockStale(info, nowMs, DEFAULT_LOCK_TIMEOUT_MS)).toBe(false);
        }), { numRuns: 100 });
    });
    it("lock acquired exactly at timeout boundary is NOT stale", () => {
        fc.assert(fc.property(lockInfoArb, (info) => {
            const acquiredMs = new Date(info.acquiredAt).getTime();
            const nowMs = acquiredMs + DEFAULT_LOCK_TIMEOUT_MS;
            expect(isLockStale(info, nowMs, DEFAULT_LOCK_TIMEOUT_MS)).toBe(false);
        }), { numRuns: 100 });
    });
    it("lock acquired beyond timeout is stale", () => {
        fc.assert(fc.property(forgePathArb, holderArb, (path, holder) => {
            const acquiredAt = new Date("2025-06-01T00:00:00Z").toISOString();
            const acquiredMs = new Date(acquiredAt).getTime();
            const info = { holder, acquiredAt, targetFile: path };
            const nowMs = acquiredMs + DEFAULT_LOCK_TIMEOUT_MS + 1;
            expect(isLockStale(info, nowMs, DEFAULT_LOCK_TIMEOUT_MS)).toBe(true);
        }), { numRuns: 100 });
    });
    it("lock with invalid timestamp is always stale", () => {
        const info = {
            holder: "test",
            acquiredAt: "not-a-date",
            targetFile: "progress/topic.md",
        };
        expect(isLockStale(info, Date.now(), DEFAULT_LOCK_TIMEOUT_MS)).toBe(true);
    });
    it("staleness is monotonic: if stale at time T, stale at T+1", () => {
        fc.assert(fc.property(lockInfoArb, fc.integer({ min: 0, max: 120_000 }), (info, elapsedMs) => {
            const acquiredMs = new Date(info.acquiredAt).getTime();
            const nowMs = acquiredMs + elapsedMs;
            const staleNow = isLockStale(info, nowMs, DEFAULT_LOCK_TIMEOUT_MS);
            const staleLater = isLockStale(info, nowMs + 1, DEFAULT_LOCK_TIMEOUT_MS);
            if (staleNow) {
                expect(staleLater).toBe(true);
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Property 25: Lock acquisition logic
// ---------------------------------------------------------------------------
describe("Property 25: Lock 获取逻辑", () => {
    it("no existing lock → always acquired", () => {
        fc.assert(fc.property(forgePathArb, holderArb, (path, holder) => {
            const result = tryAcquireLock(path, holder, null, Date.now());
            expect(result.acquired).toBe(true);
            expect(result.reason).toBe("");
        }), { numRuns: 100 });
    });
    it("same holder → always acquired (re-entrant)", () => {
        fc.assert(fc.property(forgePathArb, holderArb, isoDateArb, (path, holder, acquiredAt) => {
            const existing = {
                holder,
                acquiredAt,
                targetFile: path,
            };
            const result = tryAcquireLock(path, holder, existing, Date.now());
            expect(result.acquired).toBe(true);
        }), { numRuns: 100 });
    });
    it("stale lock by another holder → acquired", () => {
        fc.assert(fc.property(forgePathArb, holderArb, holderArb, (path, holder, otherHolder) => {
            fc.pre(holder !== otherHolder);
            const staleTime = new Date(Date.now() - DEFAULT_LOCK_TIMEOUT_MS - 1000).toISOString();
            const existing = {
                holder: otherHolder,
                acquiredAt: staleTime,
                targetFile: path,
            };
            const result = tryAcquireLock(path, holder, existing, Date.now());
            expect(result.acquired).toBe(true);
        }), { numRuns: 100 });
    });
    it("fresh lock by another holder → rejected", () => {
        fc.assert(fc.property(forgePathArb, holderArb, holderArb, (path, holder, otherHolder) => {
            fc.pre(holder !== otherHolder);
            const freshTime = new Date(Date.now() - 1000).toISOString();
            const existing = {
                holder: otherHolder,
                acquiredAt: freshTime,
                targetFile: path,
            };
            const result = tryAcquireLock(path, holder, existing, Date.now());
            expect(result.acquired).toBe(false);
            expect(result.reason).toContain(otherHolder);
        }), { numRuns: 100 });
    });
    it("rejected result always contains non-empty reason", () => {
        fc.assert(fc.property(forgePathArb, holderArb, holderArb, (path, holder, otherHolder) => {
            fc.pre(holder !== otherHolder);
            const freshTime = new Date(Date.now() - 1000).toISOString();
            const existing = {
                holder: otherHolder,
                acquiredAt: freshTime,
                targetFile: path,
            };
            const result = tryAcquireLock(path, holder, existing, Date.now());
            if (!result.acquired) {
                expect(result.reason.length).toBeGreaterThan(0);
            }
        }), { numRuns: 100 });
    });
    it("lockFilePath in result matches expected path", () => {
        fc.assert(fc.property(forgePathArb, holderArb, (path, holder) => {
            const result = tryAcquireLock(path, holder, null, Date.now());
            expect(result.lockFilePath).toBe(lockFilePath(path));
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Property 25: Serialize / Parse round-trip
// ---------------------------------------------------------------------------
describe("Property 25: LockInfo 序列化往返", () => {
    it("serialize → parse round-trip preserves all fields", () => {
        fc.assert(fc.property(lockInfoArb, (info) => {
            const serialized = serializeLockInfo(info);
            const parsed = parseLockInfo(serialized);
            expect(parsed).not.toBeNull();
            const p = parsed;
            expect(p.holder).toBe(info.holder);
            expect(p.acquiredAt).toBe(info.acquiredAt);
            expect(p.targetFile).toBe(info.targetFile);
        }), { numRuns: 200 });
    });
    it("parseLockInfo returns null for empty content", () => {
        expect(parseLockInfo("")).toBeNull();
    });
    it("parseLockInfo returns null for content missing required fields", () => {
        expect(parseLockInfo("holder: test\n")).toBeNull();
        expect(parseLockInfo("acquiredAt: 2025-01-01\n")).toBeNull();
    });
    it("createLockInfo produces valid lock info", () => {
        fc.assert(fc.property(forgePathArb, holderArb, isoDateArb, (path, holder, nowIso) => {
            const info = createLockInfo(path, holder, nowIso);
            expect(info.holder).toBe(holder);
            expect(info.acquiredAt).toBe(nowIso);
            expect(info.targetFile).not.toContain(".forge/");
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=state-locking.property.test.js.map