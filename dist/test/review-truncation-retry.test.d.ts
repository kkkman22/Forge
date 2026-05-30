/**
 * Tests for truncation-triggered serial retry in the review pipeline.
 *
 * When all 3 review layers are truncated after L0 succeeds, the pipeline
 * retries with serial execution. If retry still truncated → L3 (blocks ship).
 */
export {};
