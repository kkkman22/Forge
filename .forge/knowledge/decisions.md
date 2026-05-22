---
updated: "2026-05-18"
schema_version: 1
---

# Technical Decisions

Key architectural and technology decisions recorded during `/forge learn`.

---

## Decisions

```yaml
- decision_id: tauri-over-electron-for-desktop
  date: "2026-05-18"
  context: "Forge Loop Desktop needs a macOS app wrapper for forge-loop CLI"
  decision: "Tauri 2.x + Vue 3 instead of Electron + React"
  rationale: "Tauri produces ~15MB bundle vs Electron ~150MB. Rust backend enables native macOS APIs (Keychain, pmset, ioreg) without Node native modules. Tauri 2.x stable with good plugin ecosystem."
  tradeoffs: "Smaller community than Electron. Rust learning curve for backend. Some macOS APIs need manual FFI (DisplayServices)."
  source: ".kiro/specs/forge-loop-desktop-app/requirements.md §Design Decisions"

- decision_id: reuse-sdk-not-rust-rewrite
  date: "2026-05-18"
  context: "Desktop app needs forge-loop execution engine"
  decision: "Spawn forge-loop CLI as child process (Node.js subprocess), don't rewrite engine in Rust"
  rationale: "forge-loop SDK already has TDD enforcement, 3-layer review, 3-strike circuit breaker. Rewriting in Rust would double maintenance cost and risk behavioral drift from CLI version."
  tradeoffs: "Requires bundled Node.js (~40MB). Subprocess management complexity (SIGTERM/SIGKILL, process groups)."
  source: ".kiro/specs/forge-loop-desktop-app/requirements.md §Design Decisions"

- decision_id: pmset-over-caffeinate
  date: "2026-05-18"
  context: "Need to prevent sleep during long-running tasks, even with lid closed"
  decision: "Use sudo pmset disablesleep instead of caffeinate"
  rationale: "caffeinate cannot prevent sleep on lid close. pmset disablesleep works with closed lid. Combined with ioreg lid detection + backlightctl for power saving."
  tradeoffs: "Requires sudo (sudoers entry). Needs cleanup on crash to restore sleep behavior. More complex than caffeinate."
  source: ".kiro/specs/forge-loop-desktop-app/requirements.md §7"
```

---

<!-- Append-only convention: new decisions appended above this marker. -->
