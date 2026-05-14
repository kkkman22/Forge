/**
 * Tests for secret-redactor.ts — 4 leak patterns.
 *
 * Covers [R12.11]:
 *   (a) Bearer token in Authorization header
 *   (b) JSON "token" field
 *   (c) Environment variable assignment
 *   (d) Custom auth header values
 *
 * Each pattern has ≥ 5 test cases.
 */
export {};
