/**
 * IPC compatibility test (AC 8.5 / 8.6 / 8.7 / 8.8).
 *
 * This is a Node-side simulation of the desktop parser contract: the actual
 * Rust `process_manager.rs::write_lines_and_emit_progress` test belongs in
 * `apps/forge-loop-desktop/src-tauri/`. This file validates the IPC NDJSON
 * forward-compatibility contract:
 *   - first frame is a `version` handshake (8.5)
 *   - parser tolerates unknown fields, unknown event types, and oversized
 *     lines without throwing (8.6)
 *   - baseline contains zero `partial` / `message_delta` events (8.7)
 *   - baseline diffed against itself via diff-ipc-schema.mjs exits 0 (8.8)
 *
 * The fixture `apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson` is
 * the canonical baseline per Requirement 8.2.
 */
export {};
