/**
 * Tests for harness-detector.ts — tier detection functions.
 *
 * Covers shared detection logic for CLI and UI harnesses:
 *   - detectCmuxAvailable(): env var + socket check, 1s timeout
 *   - detectTmuxAvailable(): which tmux
 *   - detectProjectHarness(kind): glob for project test files
 *
 * **Validates: Requirements R5.2, R6.2, R14.3, R14.4**
 */
export {};
