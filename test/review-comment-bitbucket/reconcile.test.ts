import { describe, expect, it } from "vitest";
import { computeFindingHash } from "../../src/review-comment-bitbucket/finding-hash.js";
import { reconcile } from "../../src/review-comment-bitbucket/reconcile.js";
import type {
  Action,
  CommentRecord,
  Finding,
  TaskRecord,
} from "../../src/review-comment-bitbucket/types.js";

// Type narrows for discriminated union access
type DoneAction = Extract<Action, { kind: "done" }>;
type ReopenAction = Extract<Action, { kind: "reopen" }>;
type SkipAction = Extract<Action, { kind: "skip-duplicate" }>;

describe("reconcile", () => {
  const finding: Finding = {
    priority: "P1",
    finding_type: "security-issue",
    file_path: "src/app.ts",
    line_number: 42,
    line_type: "ADDED",
    message: "Potential SQL injection",
    suggestion: "Use parameterized queries",
    source_layer: "security-check",
  };

  const taskRecord: TaskRecord = {
    task_id: "task-123",
    text: "Fix security issue",
    status: "OPEN",
    marker_hash: computeFindingHash(finding),
  };

  const commentRecord: CommentRecord = {
    comment_id: "comment-789",
    file_path: "src/app.ts",
    line_number: 42,
    text: "Inline comment",
    marker_hash: computeFindingHash(finding),
  };

  // Helper to create test data with proper hashes
  const createFinding = (message: string): Finding => ({
    ...finding,
    message,
  });

  const createTask = (
    hash: string,
    status: "OPEN" | "RESOLVED",
    taskId: string = "task-123",
  ): TaskRecord => ({
    ...taskRecord,
    task_id: taskId,
    status,
    marker_hash: hash,
  });

  const createComment = (hash: string, commentId: string = "comment-789"): CommentRecord => ({
    ...commentRecord,
    comment_id: commentId,
    marker_hash: hash,
  });

  // Property Tests

  describe("P6: Missing finding → done (Latest_Task OPEN only, autoReconcileResolved=true)", () => {
    it("should generate done action when finding is missing and task is OPEN", {
      timeout: 30000,
    }, () => {
      const testFinding = createFinding("test message 1");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [],
        existingTasks: [createTask(hash, "OPEN")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.dones).toHaveLength(1);
      const done = result.dones[0] as DoneAction;
      expect(done.kind).toBe("done");
      expect(done.task_id).toBe("task-123");
      expect(done.finding_hash).toBe(hash);
    });

    it("should NOT generate done action for RESOLVED tasks", { timeout: 30000 }, () => {
      const testFinding = createFinding("test message 2");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [],
        existingTasks: [createTask(hash, "RESOLVED")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.dones).toHaveLength(0);
    });

    it("should NOT generate done action when autoReconcileResolved=false", {
      timeout: 30000,
    }, () => {
      const testFinding = createFinding("test message 3");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [],
        existingTasks: [createTask(hash, "OPEN")],
        existingComments: [],
        autoReconcileResolved: false,
        autoReopenRegressed: true,
      });

      expect(result.dones).toHaveLength(0);
    });
  });

  describe("P7: New finding → create (p0_p1_strategy=pr-task: only check task hash set)", () => {
    it("should create when no task or comment exists", { timeout: 30000 }, () => {
      const testFinding = createFinding("new finding 1");
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
        p0_p1_strategy: "pr-task",
      });

      expect(result.creates).toHaveLength(1);
      expect(result.creates[0].kind).toBe("create");
    });

    it("should create when only comment exists (no task) with pr-task strategy", {
      timeout: 30000,
    }, () => {
      const testFinding = createFinding("new finding 2");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [],
        existingComments: [createComment(hash)],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
        p0_p1_strategy: "pr-task",
      });

      expect(result.creates).toHaveLength(1);
      expect(result.creates[0].kind).toBe("create");
    });

    it("should skip when task exists (even if comment missing) with pr-task strategy", {
      timeout: 30000,
    }, () => {
      const testFinding = createFinding("new finding 3");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [createTask(hash, "OPEN")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
        p0_p1_strategy: "pr-task",
      });

      expect(result.creates).toHaveLength(0);
      expect(result.skips).toContainEqual(
        expect.objectContaining({ kind: "skip-duplicate", finding_hash: hash }),
      );
    });
  });

  describe("P8: Conflict RESOLVED + still present → reopen (Latest_Task)", () => {
    it("should reopen when finding still present and task is RESOLVED", { timeout: 30000 }, () => {
      const testFinding = createFinding("regressed issue");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [createTask(hash, "RESOLVED")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.reopens).toHaveLength(1);
      const reopen = result.reopens[0] as ReopenAction;
      expect(reopen.kind).toBe("reopen");
      expect(reopen.task_id).toBe("task-123");
      expect(reopen.finding).toEqual(testFinding);
    });

    it("should NOT reopen when autoReopenRegressed=false", { timeout: 30000 }, () => {
      const testFinding = createFinding("regressed issue 2");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [createTask(hash, "RESOLVED")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: false,
      });

      expect(result.reopens).toHaveLength(0);
      expect(result.skips).toContainEqual(
        expect.objectContaining({ kind: "skip-duplicate", finding_hash: hash }),
      );
    });
  });

  describe("P9: creates/dones/reopens — same hash at most once (mutual exclusivity)", () => {
    it("should not have same hash in multiple action sets", { timeout: 30000 }, () => {
      const result = reconcile({
        currentFindings: [
          { ...finding, message: "finding1" },
          { ...finding, message: "finding2" },
        ],
        existingTasks: [
          { ...taskRecord, task_id: "task-1", status: "RESOLVED", marker_hash: "hash1" },
          { ...taskRecord, task_id: "task-2", status: "OPEN", marker_hash: "hash2" },
        ],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      const _allHashes = [
        ...result.creates.map((a) => (a.kind === "create" ? "create" : "unknown")),
        ...result.dones.map((a) => (a as DoneAction).finding_hash),
        ...result.reopens.map((a) => computeFindingHash((a as ReopenAction).finding)),
        ...result.skips.map((a) => (a as SkipAction).finding_hash),
      ];

      const createHashes = new Set(result.creates.map(() => "create"));
      const doneHashes = new Set(result.dones.map((a) => (a as DoneAction).finding_hash));
      const reopenHashes = new Set(result.reopens.map((a) => computeFindingHash((a as ReopenAction).finding)));

      const hasOverlap =
        [...createHashes].some((h) => doneHashes.has(h) || reopenHashes.has(h)) ||
        [...doneHashes].some((h) => reopenHashes.has(h));

      expect(hasOverlap).toBe(false);
    });
  });

  describe("P10: autoReconcileResolved=false → dones === []", () => {
    it("should have empty dones when autoReconcileResolved=false", { timeout: 30000 }, () => {
      const finding1 = createFinding("test 1");
      const finding2 = createFinding("test 2");
      const result = reconcile({
        currentFindings: [],
        existingTasks: [
          createTask(computeFindingHash(finding1), "OPEN", "task-1"),
          createTask(computeFindingHash(finding2), "OPEN", "task-2"),
        ],
        existingComments: [],
        autoReconcileResolved: false,
        autoReopenRegressed: true,
      });

      expect(result.dones).toHaveLength(0);
    });
  });

  describe("P11: autoReopenRegressed=false → reopens === [], RESOLVED falls into skips", () => {
    it("should have empty reopens when autoReopenRegressed=false", { timeout: 30000 }, () => {
      const testFinding = createFinding("finding1");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [createTask(hash, "RESOLVED")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: false,
      });

      expect(result.reopens).toHaveLength(0);
      expect(result.skips).toContainEqual(
        expect.objectContaining({ kind: "skip-duplicate", finding_hash: hash }),
      );
    });
  });

  describe("P12: has_p0_p1 === currentFindings.some(P0|P1)", () => {
    it("should be true when finding has P0", { timeout: 30000 }, () => {
      const result = reconcile({
        currentFindings: [{ ...finding, priority: "P0" }],
        existingTasks: [],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.has_p0_p1).toBe(true);
    });

    it("should be true when finding has P1", { timeout: 30000 }, () => {
      const result = reconcile({
        currentFindings: [{ ...finding, priority: "P1" }],
        existingTasks: [],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.has_p0_p1).toBe(true);
    });

    it("should be false when only P2/P3 findings", { timeout: 30000 }, () => {
      const result = reconcile({
        currentFindings: [
          { ...finding, priority: "P2" },
          { ...finding, priority: "P3" },
        ],
        existingTasks: [],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.has_p0_p1).toBe(false);
    });

    it("should be true when mixed priorities include P0/P1", { timeout: 30000 }, () => {
      const result = reconcile({
        currentFindings: [
          { ...finding, priority: "P2" },
          { ...finding, priority: "P0" },
          { ...finding, priority: "P3" },
        ],
        existingTasks: [],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.has_p0_p1).toBe(true);
    });
  });

  describe("P13: Non-Forge-marker tasks/comments → not referenced in any action", () => {
    it("should ignore tasks without marker_hash", { timeout: 30000 }, () => {
      const result = reconcile({
        currentFindings: [],
        existingTasks: [{ ...taskRecord, marker_hash: undefined }],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.dones).toHaveLength(0);
      expect(result.creates).toHaveLength(0);
      expect(result.reopens).toHaveLength(0);
      expect(result.skips).toHaveLength(0);
    });

    it("should ignore comments without marker_hash", { timeout: 30000 }, () => {
      const result = reconcile({
        currentFindings: [{ ...finding, message: "new finding" }],
        existingTasks: [],
        existingComments: [{ ...commentRecord, marker_hash: undefined }],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.skips).toHaveLength(0);
    });
  });

  // Unit Tests

  describe("Unit: Latest_Task rule (same marker_hash with multiple tasks)", () => {
    it("should only operate on max(task_id) when multiple tasks share marker_hash", () => {
      const testFinding = createFinding("test for max task");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [],
        existingTasks: [
          createTask(hash, "OPEN", "task-100"),
          createTask(hash, "OPEN", "task-200"),
          createTask(hash, "OPEN", "task-50"),
        ],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.dones).toHaveLength(1);
      // String comparison: "task-200" > "task-100" > "task-50"
      expect((result.dones[0] as DoneAction).task_id).toBe("task-200");
    });
  });

  describe("Unit: p0_p1_strategy=pr-task + history has only inline comment", () => {
    it("should create when pr-task strategy and only comment exists", () => {
      const testFinding = createFinding("new finding with comment");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [],
        existingComments: [createComment(hash)],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
        p0_p1_strategy: "pr-task",
      });

      expect(result.creates).toHaveLength(1);
    });
  });

  describe("Unit: Non pr-task strategy + history has comment but no task", () => {
    it("should skip with orphan-comment when strategy is both", () => {
      const testFinding = createFinding("new finding both strategy");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [],
        existingComments: [createComment(hash)],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
        p0_p1_strategy: "both",
      });

      expect(result.creates).toHaveLength(0);
      expect(result.skips).toContainEqual(
        expect.objectContaining({ kind: "skip-duplicate", finding_hash: hash }),
      );
    });

    it("should skip with orphan-comment when strategy is inline-only", () => {
      const testFinding = createFinding("new finding inline-only strategy");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [],
        existingComments: [createComment(hash)],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
        p0_p1_strategy: "inline-only",
      });

      expect(result.creates).toHaveLength(0);
      expect(result.skips).toContainEqual(
        expect.objectContaining({ kind: "skip-duplicate", finding_hash: hash }),
      );
    });
  });

  describe("Unit: Reopen action carries comment_id for parent_comment_id linkage", () => {
    it("should include comment_id when reopening a task with linked comment", () => {
      const testFinding = createFinding("regressed");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [
          createTask(hash, "RESOLVED"),
          {
            ...createTask(hash, "RESOLVED"),
            task_id: "task-123",
            parent_comment_id: "comment-789",
          },
        ],
        existingComments: [createComment(hash, "comment-789")],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.reopens).toHaveLength(1);
      expect((result.reopens[0] as ReopenAction).comment_id).toBe("comment-789");
    });
  });

  describe("Unit: Done action carries comment_id for parent_comment_id linkage", () => {
    it("should include comment_id when closing a task with linked comment", () => {
      const testFinding = createFinding("fixed issue");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [],
        existingTasks: [
          { ...createTask(hash, "OPEN"), task_id: "task-123", parent_comment_id: "comment-789" },
        ],
        existingComments: [createComment(hash, "comment-789")],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.dones).toHaveLength(1);
      expect((result.dones[0] as DoneAction).comment_id).toBe("comment-789");
    });
  });

  // Additional edge case tests

  describe("Edge cases", () => {
    it("should handle empty input", () => {
      const result = reconcile({
        currentFindings: [],
        existingTasks: [],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.creates).toHaveLength(0);
      expect(result.dones).toHaveLength(0);
      expect(result.reopens).toHaveLength(0);
      expect(result.skips).toHaveLength(0);
      expect(result.has_p0_p1).toBe(false);
    });

    it("should skip-duplicate when task exists with OPEN status", () => {
      const testFinding = createFinding("existing open");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [createTask(hash, "OPEN")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.creates).toHaveLength(0);
      expect(result.skips).toContainEqual(
        expect.objectContaining({ kind: "skip-duplicate", finding_hash: hash }),
      );
    });

    it("should skip-duplicate when task exists with RESOLVED and autoReopenRegressed=false", () => {
      const testFinding = createFinding("existing resolved");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [testFinding],
        existingTasks: [createTask(hash, "RESOLVED")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: false,
      });

      expect(result.creates).toHaveLength(0);
      expect(result.reopens).toHaveLength(0);
      expect(result.skips).toContainEqual(
        expect.objectContaining({ kind: "skip-duplicate", finding_hash: hash }),
      );
    });

    it("should skip-duplicate for historical tasks that are RESOLVED", () => {
      const testFinding = createFinding("historical resolved");
      const hash = computeFindingHash(testFinding);
      const result = reconcile({
        currentFindings: [],
        existingTasks: [createTask(hash, "RESOLVED")],
        existingComments: [],
        autoReconcileResolved: true,
        autoReopenRegressed: true,
      });

      expect(result.dones).toHaveLength(0);
      expect(result.skips).toContainEqual(
        expect.objectContaining({ kind: "skip-duplicate", finding_hash: hash }),
      );
    });
  });
});
