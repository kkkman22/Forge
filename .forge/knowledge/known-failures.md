---
updated: "2026-05-16"
schema_version: 1
---

# 已知失败模式

由 `/forge review` 自动累积的 P0/P1 失败模式库。`spec-check` / `quality-check` / `security-check` 在 Step 0.5 检索本文件做 recurrence 检测，新发现的 P0/P1 issue 通过 Step 0.6 的 append-block 自动追加。

retention：>100 条触发自动归档到 `.forge/archive/known-failures-<date>.md`，保留最新 80 条。

---

## Active Patterns

```yaml
- pattern_id: tauri-child-process-zombie-on-parent-exit
  severity: P1
  first_seen: "2026-05-19"
  last_seen: "2026-05-19"
  occurrence_count: 1
  first_seen_commit: dce8820
  last_seen_commit: dce8820
  signature: "Tauri Rust backend spawns child processes (forge-loop CLI via ProcessManager) without setting independent process groups. When app exits or crashes, child processes become zombies or orphaned — still consuming resources, holding file locks, or running indefinitely."
  fix_required: "Use process_group_kill (POSIX setpgid + kill(-pgid)) when spawning. On app exit (RunEvent::Exit), synchronously kill all tracked children via kill_task_sync(). Mark Running tasks as Failed on next launch via recover_orphan_processes()."
  source_review: "apps/forge-loop-desktop/src-tauri/src/process_manager.rs"
  detection_signal: "After force-quitting the desktop app, `ps aux | grep forge-loop` still shows running child processes"
  verification_command: "grep -c 'kill_task_sync\\|setpgid\\|process_group' apps/forge-loop-desktop/src-tauri/src/process_manager.rs"

- pattern_id: macos-dmg-not-notarized-gatekeeper-blocks-launch
  severity: P1
  first_seen: "2026-05-19"
  last_seen: "2026-05-19"
  occurrence_count: 1
  first_seen_commit: dce8820
  last_seen_commit: dce8820
  signature: "macOS .dmg built by cargo tauri build is unsigned and unnotarized. On macOS 10.15+, Gatekeeper blocks double-click launch with 'cannot be opened because it is from an unidentified developer'. Users must bypass via System Preferences > Security & Privacy."
  fix_required: "Configure tauri.conf.json bundle.macOS.signingIdentity and notarize credentials. CI pipeline must run `xcrun notarytool submit` after build. Local dev builds can skip signing but must document the Gatekeeper bypass steps in README."
  source_review: "apps/forge-loop-desktop/src-tauri/tauri.conf.json"
  detection_signal: "User reports 'cannot be opened' error on double-click; `spctl --assess --type execute` returns rejected"
  verification_command: "codesign -dv apps/forge-loop-desktop/src-tauri/target/release/bundle/macos/*.app 2>&1 | head -3"

- pattern_id: pmset-disablesleep-not-recovered-after-crash
  severity: P1
  first_seen: "2026-05-19"
  last_seen: "2026-05-19"
  occurrence_count: 1
  first_seen_commit: dce8820
  last_seen_commit: dce8820
  signature: "pmset disablesleep is called on task start but never reverted if app crashes or is force-killed. System remains in no-sleep state indefinitely, draining battery on laptops. Normal exit handler clears it, but crash path skips cleanup."
  fix_required: "Use file-based panic marker pattern: write .panic_marker on startup, clear on clean exit. On next launch, check marker + running_count == 0 → call pmset sleepenable. Also add recover_stale_inhibition() in app setup to catch orphaned disablesleep state."
  source_review: "apps/forge-loop-desktop/src-tauri/src/sleep_guard.rs, src/lib.rs"
  detection_signal: "After app crash, `pmset -g | grep disablesleep` still shows 1; laptop battery drains overnight"
  verification_command: "grep -c 'recover_stale\\|panic_marker\\|clear_panic' apps/forge-loop-desktop/src-tauri/src/lib.rs"

- pattern_id: bundled-node-path-with-spaces-spawn-fails
  severity: P2
  first_seen: "2026-05-19"
  last_seen: "2026-05-19"
  occurrence_count: 1
  first_seen_commit: dce8820
  last_seen_commit: dce8820
  signature: "Bundled Node.js binary path contains spaces (e.g. /Applications/Forge Loop.app/Contents/Resources/node/bin/node). std::process::Command splits on spaces when path is not properly quoted or passed as separate args, causing spawn ENOENT."
  fix_required: "Always pass binary path as first arg to Command::new(), not as part of .args(). In ProcessManager::spawn_task, construct the node path from resources_dir and pass it directly. Test with `cargo test` after renaming resources dir to include spaces."
  source_review: "apps/forge-loop-desktop/src-tauri/src/process_manager.rs"
  detection_signal: "App launches on system with spaces in Application path, task start fails with 'No such file or directory'"
  verification_command: "grep -A5 'Command::new' apps/forge-loop-desktop/src-tauri/src/process_manager.rs | head -10"

- pattern_id: security-control-stub-returns-ok-true
  severity: P1
  first_seen: "2026-05-17"
  last_seen: "2026-05-17"
  occurrence_count: 1
  first_seen_commit: 37f5cf0
  last_seen_commit: 37f5cf0
  signature: "Security chokepoint function (integrity check, tool scoping) returns hardcoded { ok: true } instead of performing actual validation. Mock/stub from initial scaffold never replaced with real implementation."
  fix_required: "Every security control in a dispatcher chokepoint must perform actual validation. Stubs must return errors, not { ok: true }. Review must verify production path calls real functions, not stubs."
  source_review: ".forge/reviews/forge-single-entry-skills-collapse.md (P1-S1, P1-S2)"

- pattern_id: mock-content-used-in-production-path
  severity: P1
  first_seen: "2026-05-17"
  last_seen: "2026-05-17"
  occurrence_count: 1
  first_seen_commit: 37f5cf0
  last_seen_commit: 37f5cf0
  signature: "Dispatcher reads hardcoded mock string instead of actual file content when resolving per-entry behavior (tools, dispatch mode). Production path skips file read."
  fix_required: "After path resolution succeeds, always read the actual file. Mock paths should be isolated behind explicit mock guards, not used as default fallback."
  source_review: ".forge/reviews/forge-single-entry-skills-collapse.md (P1-S1)"

- pattern_id: spec-skill-doc-skeleton-incomplete
  severity: P1
  first_seen: "2026-05-16"
  last_seen: "2026-05-16"
  occurrence_count: 1
  first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  last_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  signature: "SKILL.md 章节仅声明字段名而无 schema 范例，下游 agent 无法机械化生成符合规范的输出"
  fix_required: "SKILL 章节描述结构化输出时，必须附 JSON/YAML 完整范例块；至少含一组真实字段值。修复模板：声明字段 → '完整 schema 范例：' → fenced code block。"
  source_review: ".forge/reviews/missions-inspired-rigor-audit-fixes.md"

- pattern_id: spec-skill-doc-section-mapping-drift
  severity: P2
  first_seen: "2026-05-16"
  last_seen: "2026-05-16"
  occurrence_count: 1
  first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  last_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  signature: "design.md 引用 SKILL '某 §N' 但实际实现写到了 §M，且 §N 已被其他主题占用，无法直接修订"
  fix_required: "实现侧无需移动章节顺序，但必须在新章节末尾加'文档定位说明'明确承担原 design 中哪个 Section 的职责，避免后续 reviewer 按章节号搜索 schema 找不到。"
  source_review: ".forge/reviews/missions-inspired-rigor-audit-fixes.md"

- pattern_id: build-handoff-not-consumed-after-impl
  severity: P1
  first_seen: "2026-05-16"
  last_seen: "2026-05-16"
  occurrence_count: 1
  first_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  last_seen_commit: 448916f39b4af374d9c8ffa165c0113cb66faffa
  signature: "实现 schema/parser 完整且单元测试 100% 绿，但 SKILL 部署后 .forge/progress/*.md 持续 0 条真实 handoff block"
  fix_required: "完成 R2 类'agent 必须输出特定结构'的实现后，必须用一次最小真实 build 触发 SKILL 输出（dogfooding），并在 spec 的 Validation Contract 中将 'Verify-By: vitest' 升级为 'Verify-By: vitest + manual'，要求 progress 文件 grep 出至少一条真实 handoff block。"
  source_review: ".forge/reviews/missions-inspired-rigor-audit-fixes.md"

- pattern_id: ci-check-command-frontmatter-drift
  severity: P1
  first_seen: "2026-05-16"
  last_seen: "2026-05-16"
  occurrence_count: 1
  first_seen_commit: 855fec9d22927bbbb6ea7e228029070c8d507e16
  last_seen_commit: 855fec9d22927bbbb6ea7e228029070c8d507e16
  signature: "templates/config.md frontmatter 已声明 ci_check_command 字段，但仓库 .forge/config.md 未补齐该字段；forge-test SKILL Layer 3 因此走逐项回退分支，AI 自拼 typecheck/lint/test 三件套，漏掉 dist-sync、check-doc-structure、validate-skill-* 等十余条校验，推送后 GitHub CI 才暴露失败"
  fix_required: "1) 验证命令 grep '^ci_check_command:' .forge/config.md 必须有输出且值与 package.json scripts.check 一致；2) 缺失时 forge-test SKILL 应通过 detectCiCommandDrift 主动检测并降级到 npm run check（Spec local-ci-parity Req 2 已实现）；3) forge init 在检测到 package.json scripts.check 时应主动建议默认值（Req 4 已实现）。"
  source_review: ".kiro/specs/local-ci-parity/"
  detection_signal: "GitHub CI 失败列表里包含本地从未运行的命令名（dist-sync、check-doc-structure、validate-skill-* 等）"
  verification_command: "grep '^ci_check_command:' .forge/config.md"
```

---

<!-- Append-only convention: new entries appended above this marker; existing entries only update last_seen / last_seen_commit / occurrence_count. -->
<!-- Format reference (legacy): see git history for original placeholder template. -->
