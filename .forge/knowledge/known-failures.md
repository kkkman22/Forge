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

- pattern_id: skill-function-defined-without-production-caller
  severity: P0
  first_seen: "2026-05-23"
  last_seen: "2026-05-23"
  occurrence_count: 1
  first_seen_commit: bb72a5d
  last_seen_commit: 2f3adb3
  signature: "新增大量纯函数（detectSpecKind / runImportMode / runBugfixOrchestration / parseWaves / scheduleWave / triggerThreeStrikeReroute / migrateLegacySpec 等），单元测试全绿、SKILL.md 散文里提到了函数名，但 src/ 中没有任何 production caller import 这些函数。skill-function-registry 注册项与 SKILL.md 引用都只是契约表，不等于运行时调用。结果：spec 描述的 wave 并行执行 / 三振写诊断模板 / 自动迁移在生产路径上从不触发；3 轮 review 后才暴露。"
  fix_required: "审核 P0/P1 级 wire 工作时，每个 wire commit 必须以 'production caller grep 命中' 为验收证据：grep '函数名' src/build.ts | wc -l；同时 skill instructions.md 必须显式调用该函数（不只是 narrative 提及）。三层判据缺一不可：(A) 函数存在 (B) 实现非 stub (C) production caller 引用（skill instructions.md 显式 + src/ 实际 import）。仅 contract test 注册项不足以视为接入。"
  source_review: ".forge/reviews/forge-kiro-style-spec-workflow-round2.md, forge-kiro-style-spec-workflow-round3.md"
  detection_signal: "grep '<新函数名>' src/ 在新函数所在文件以外命中数为 0；commit message 自陈 'wire X' 但 git diff 显示 src/build.ts / src/plan.ts / src/spec.ts 一字未改"
  verification_command: "for f in detectSpecKind runImportMode parseWaves scheduleWave triggerThreeStrikeReroute migrateLegacySpec; do echo \"$f: $(grep -RIn \"$f\" src/ | grep -vE 'spec-kind|spec-import|spec-wave|spec-pbt|spec-migration|spec-bugfix' | wc -l)\"; done"

- pattern_id: ears-rewrite-identity-wrap-defeats-anl-01
  severity: P0
  first_seen: "2026-05-23"
  last_seen: "2026-05-23"
  occurrence_count: 1
  first_seen_commit: d48ed18
  last_seen_commit: 2f3adb3
  signature: "enforceEarsSyntax 多策略重写函数的最后一个兜底策略写成 'return 当 ${text} 时 系统应当 ${text}'（identity wrap），任意输入第一次必匹配 EARS_FULL，后续 retries 是死代码。renderer 无论传什么乱码都得到形式合规的输出，ANL-01 检查在生产路径上永远不会拒绝。Round 2 audit 误以为'多策略'已修复，实际只是把恒等映射伪装成 strategy[3]。"
  fix_required: "兜底策略不允许复用同一段文本作为 condition 与 action。可选 split（comma / 顿号）+ 兜底 exhausted=true 不写盘。验证：fast-check 测试需断言 'retries=策略次数 → 所有策略都不命中 → exhausted=true && output===input'；不能有 pure identity wrap 路径。"
  source_review: ".forge/reviews/forge-kiro-style-spec-workflow-round2.md (P0-4)"
  detection_signal: "grep 兜底策略形如 '当 ${text} 时 系统应当 ${text}'（或类似 identity 模板）"
  verification_command: "grep -E '当\\\\s+\\\\$\\\\{[a-z]+\\\\}\\\\s+时\\\\s+系统应当\\\\s+\\\\$\\\\{[a-z]+\\\\}' src/spec-validation.ts || echo 'no identity wrap (PASS)'"

- pattern_id: type-broken-fixture-passes-tests-fails-typecheck
  severity: P0
  first_seen: "2026-05-23"
  last_seen: "2026-05-23"
  occurrence_count: 1
  first_seen_commit: 279f57f3
  last_seen_commit: 2f3adb3
  signature: "wire commit 让 src/build.ts:scheduleWave 读 wave.taskIds，但 Wave 类型字段是 wave.tasks。fixture 测试用 { id, taskIds } 与函数实现一致（互相 reinforce），单元测试全绿，但 npx tsc --noEmit 报 4 个 TS2353 / TS2551。production 数据流 parseWaves → scheduleWave 直接断（parseWaves 输出永远没 taskIds 字段，运行时 NPE）。开发者看到 vitest 全绿就 commit，没跑 typecheck。"
  fix_required: "task GREEN 验证必须 'tsc --noEmit && vitest'，不允许只跑 vitest。SKILL build/instructions.md §3.5 Final Validation 已写要求跑 npm run check（含 typecheck），需要在 forge-build 的 task post-verify 强制执行而非可选。"
  source_review: ".forge/reviews/forge-kiro-style-spec-workflow-round3.md (§4.1)"
  detection_signal: "vitest 全绿 + tsc --noEmit 报 TS2353/TS2551 类型不一致错误；fixture 字段名与生产类型字段名不匹配"
  verification_command: "npx tsc --noEmit 2>&1 | grep -E 'TS2353|TS2551' | wc -l"

- pattern_id: double-implementation-only-rename
  severity: P1
  first_seen: "2026-05-23"
  last_seen: "2026-05-23"
  occurrence_count: 1
  first_seen_commit: 5401e1c0
  last_seen_commit: 2f3adb3
  signature: "spec-validation.ts 与 spec-leak-detector.ts 都导出 detectSpecLeak。Round 2 review 报双实现冲突，开发者把 spec-validation.ts 的 detectSpecLeak 重命名为 detectSpecLeakFromBundle 就声明已修复，但两边的扫描逻辑（5 条硬编码正则 vs banned-patterns.yaml 注册表）依旧并存且不同步，spec-health.ts 仍调用 leak-detector 老路径。重命名 ≠ 合并。"
  fix_required: "合并双实现成 layered design：canonical（pack-aware）+ adapter（bundle-aware）。adapter 的词典必须从 canonical 派生（lenient = strict − structural-only），并在文件头注释清楚 layering 关系。删除或显式标记任何 'rename only' commit 留下的死代码。"
  source_review: ".forge/reviews/forge-kiro-style-spec-workflow-round3.md (P0-11)"
  detection_signal: "两个文件都 export 同名函数（grep -RIn 'export.*<函数名>' src/）；下游 caller 分别走不同实现"
  verification_command: "grep -RIn 'export.*detectSpecLeak\\\\b' src/ | wc -l  # 期望 1"

- pattern_id: rollback-uses-derived-path-not-recorded-path
  severity: P2
  first_seen: "2026-05-23"
  last_seen: "2026-05-23"
  occurrence_count: 1
  first_seen_commit: 031fd063
  last_seen_commit: 2f3adb3
  signature: "spec-migration.ts 回滚路径用 featureName（目录名）重构 plans .legacy 路径，但前向迁移用 frontmatter feature 字段定位 plans/<feature>.md。两者不一致时（feature: 'authentication' / 目录名 'auth'），回滚找错文件，原 plans 文件留在 .legacy 状态丢失。"
  fix_required: "前向操作的副作用路径必须在执行时 capture（写入闭包变量或返回值），回滚时直接使用 captured 值，不要在 catch 块里基于 derived 信息重新计算路径。模式：let renamedPath: string | null = null; renamedPath = doRename(...); 在 catch 中直接 renameSync(renamedPath, ...)。"
  source_review: ".forge/reviews/forge-kiro-style-spec-workflow-round4.md (P2-B)"
  detection_signal: "前向操作用 frontmatter / 解析得到的标识，回滚操作用目录名 / 命令行参数等不同来源；两者可能不一致"
  verification_command: "grep -A3 'catch (err)' src/spec-migration.ts | grep -E 'featureName|featureDir.split' || echo 'no derived rollback (PASS)'"
```

- pattern_id: dangling-exports-subpath-after-source-deletion
  severity: P0
  first_seen: "2026-06-13"
  last_seen: "2026-06-13"
  occurrence_count: 1
  first_seen_commit: 8529b468
  last_seen_commit: 8529b468
  signature: "删除公开源文件（如 deprecated.ts）但未同步移除 package.json exports 中对应的 subpath 条目。Node.js --experimental-specifier-resolution 或 consumers 按 exports map 解析时得到 404/MODULE_NOT_FOUND。"
  fix_required: "删除公开源文件时必须三件套：(1) grep package.json exports map 移除对应条目；(2) 检查 barrel src/index.ts 是否 re-export 该模块；(3) CHANGELOG.md [Unreleased] ### Removed 登记。Review adversarial layer 重点检查 exports map 一致性。"
  source_review: ".forge/reviews/code-slim-0612.md (P0-S1)"
  detection_signal: "git log 显示 DELETE src/*.ts 但 package.json exports 未变更；`node -e \"require('./deprecated')\"` 报 MODULE_NOT_FOUND"
  verification_command: "node -e \"const p=require('./package.json'); Object.keys(p.exports||{}).forEach(k => { try { require.resolve(k) } catch(e) { console.log('DANGLING:', k) } })\""

---

<!-- Append-only convention: new entries appended above this marker; existing entries only update last_seen / last_seen_commit / occurrence_count. -->
<!-- Format reference (legacy): see git history for original placeholder template. -->
