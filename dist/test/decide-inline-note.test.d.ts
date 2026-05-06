/**
 * Integration tests for the inline decision note machinery in
 * `src/decide.ts`.
 *
 * Covers three cooperating pieces introduced for Requirement 2.9:
 *
 *   - `renderInlineDecisionNote`    — pure renderer that produces the
 *                                     `<!-- decision: ... | reason: ... -->`
 *                                     one-liner and escapes any `-->`
 *                                     sequences inside the content so
 *                                     the comment cannot terminate
 *                                     prematurely
 *   - `resolveUpstreamFile`         — pure priority picker that routes
 *                                     an inline note to the right
 *                                     upstream document (progress >
 *                                     plan > spec > null)
 *   - `appendInlineNote`            — IO-bearing driver that appends
 *                                     the rendered note to a file via
 *                                     a minimal `InlineNoteAppender`
 *                                     interface, preserving prior
 *                                     content and inserting a blank
 *                                     line separator when needed
 *
 * All filesystem access is faked with an in-memory `Map` so the test
 * stays deterministic and sandbox-friendly.
 *
 * **Validates: Requirements 2.9**
 */
export {};
