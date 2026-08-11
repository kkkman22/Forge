/**
 * Knowledge Quota — pure functions for the near-limit warning emitted by
 * `/tinkerman learn` before writing a new solutions document.
 *
 * Side-effect free: the learn skill counts files on disk and passes the count
 * in; this module only decides whether the warning should fire and shapes the
 * message. The warning is advisory (non-blocking) per spec R4 AC3.
 *
 * **Validates: Requirements R4 AC1-AC4**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for the near-limit check. */
export interface KnowledgeQuotaInput {
  /** Current solutions document count (caller counts .forge/knowledge/solutions/). */
  currentCount: number;
  /** config.md `knowledge_limit` (default 20). */
  limit: number;
  /** Trigger ratio; defaults to 0.9 when omitted. */
  thresholdRatio?: number;
}

/** Result of the near-limit check. */
export interface KnowledgeQuotaDecision {
  /** True when currentCount >= threshold. */
  nearLimit: boolean;
  /** The computed threshold = ceil(limit * ratio). */
  threshold: number;
  /** Message when nearLimit; undefined otherwise (zero noise). */
  message?: string;
}

/** Default trigger ratio (90%). */
const DEFAULT_THRESHOLD_RATIO = 0.9;

// ---------------------------------------------------------------------------
// Core judgment
// ---------------------------------------------------------------------------

/**
 * Decide whether the knowledge base is near its configured limit.
 *
 * Pure: no I/O. The caller is responsible for counting files and for any
 * blocking decision (this function only advises — R4 AC3).
 *
 * @param input  count, limit, optional ratio
 */
export function checkKnowledgeNearLimit(input: KnowledgeQuotaInput): KnowledgeQuotaDecision {
  const ratio = input.thresholdRatio ?? DEFAULT_THRESHOLD_RATIO;
  const threshold = Math.ceil(input.limit * ratio);

  if (input.currentCount >= threshold) {
    return {
      nearLimit: true,
      threshold,
      message:
        `[knowledge-near-limit] 知识库逼近上限: 当前 ${input.currentCount}/${input.limit} ` +
        `(阈值 ${threshold})。建议执行清理 (Confidence<0.3 自动清理) 或提升 instincts,而非等超限被动清理。`,
    };
  }

  return { nearLimit: false, threshold };
}
