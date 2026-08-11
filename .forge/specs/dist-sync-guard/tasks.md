---
feature: dist-sync-guard
layout: tasks
created: 2026-05-10
spec_ref: ".forge/specs/dist-sync-guard/requirements.md"
---

# Implementation Plan

按 TDD 铁律（RED → GREEN → REFACTOR）执行。总工作量约 0.5-1 个工作日（约 6 小时）。

**新增文件**：
- `src/dist-sync.ts` (纯函数)
- `scripts/check-dist-sync.mjs` (CLI)
- `scripts/dist-resync.sh` (本地便利)
- `test/dist-sync.test.ts` (单元测试)
- `test/dist-sync.property.test.ts` (property test)

**修改文件**：
- `package.json` (2 个脚本)
- `CONTRIBUTING.md` (新章节)
- `.forge/knowledge/evolved-rules.md` (R6 + rule_count)

---

## Wave 1: 核心纯函数层（≈ 2 小时）

- [x] 1. `src/dist-sync.ts` 类型定义 + 路径映射函数
  - [x] 1.1 RED：`test/dist-sync.test.ts` 覆盖
    - `srcToExpectedDist("src/foo.ts")` → `["dist/src/foo.js", "dist/src/foo.d.ts"]`
    - 嵌套路径 `src/pack/loader.ts` → `["dist/src/pack/loader.js", "dist/src/pack/loader.d.ts"]`
    - `distToExpectedSrc("dist/src/foo.js")` → `"src/foo.ts"`
    - 非 `.ts` / 非 `src/` 开头的路径 → null 或空数组
  - [x] 1.2 GREEN：实现 `srcToExpectedDist()` / `distToExpectedSrc()`
  - [x] 1.3 Property test：round-trip（`distToExpectedSrc(srcToExpectedDist(s)[0]) === s`）
  - 引用：R1 AC1 (A)(B)，Design §3.2

- [x] 2. `detectDrift()` 纯函数
  - [x] 2.1 RED：扩展 `test/dist-sync.test.ts`
    - 缺失 dist（新 src 未编译）→ missingInDist 非空
    - 孤儿 dist（src 已删但 dist 留存）→ orphansInDist 非空
    - 编译一致（fresh tsc 输出 == tracked dist）→ compilationMismatch 空
    - 编译不一致（SHA 差异）→ compilationMismatch 非空
    - 全部同步 → summary.drifted = 0
  - [x] 2.2 GREEN：实现 `detectDrift(input)`
    - 三种 drift 并行检测（不依赖顺序）
    - 返回 DriftReport 含 summary
  - [x] 2.3 Property test：`detectDrift({...empty})` 返回 clean report
  - 引用：R1 AC1 (A)(B)(C)，Design §4.1

---

## Wave 2: CLI 驱动（≈ 2 小时）

- [x] 3. `scripts/check-dist-sync.mjs` 骨架
  - [x] 3.1 解析 `--help` / `--verbose` flag
  - [x] 3.2 检查 skip 条件：`FORGE_SKIP_DIST_SYNC=1` 环境变量 + commit message 含 `[dist-sync-skip]`
  - [x] 3.3 Skip 时打印 WARNING 日志，exit 0
  - 引用：R1 AC7

- [x] 4. Phase 1-2: 文件列表收集 + 临时 tsc 编译
  - [x] 4.1 `git ls-files 'src/**/*.ts' 'dist/**'` 获取 tracked 文件列表
  - [x] 4.2 排除 `*.d.ts` from src（只有 `.ts` 算源码）
  - [x] 4.3 `npx tsc --outDir .forge/.dist-sync-check/` 编译到临时目录
  - [x] 4.4 计算 tracked dist 和 temp dist 的 SHA-256 checksums
  - [x] 4.5 确保 `.forge/.dist-sync-check/` 在 finally 块清理
  - 引用：R1 AC1 (C), AC4

- [x] 5. Phase 3-5: 调用 detectDrift + 格式化报告
  - [x] 5.1 调用纯函数 `detectDrift(input)` 拿 DriftReport
  - [x] 5.2 若 drift 存在：打印分类报告（missing / orphan / mismatch 分节）+ 修复提示 `npm run dist:resync`
  - [x] 5.3 若 clean：打印 `dist-sync: OK — N src files matched with dist/`
  - [x] 5.4 exit code 对齐 R1 AC2/AC3
  - 引用：R1 AC2, AC3, R5 AC4

- [x] 6. 集成到 `npm run check`
  - [x] 6.1 `package.json` check 脚本末尾追加 `&& node scripts/check-dist-sync.mjs`
  - [x] 6.2 验证顺序：放在 `verify-evolved-rule-infra-refs.mjs` 之后，与其它 linter 同级
  - 引用：R1 AC5

- [x] 7. CI workflow 集成（如需要）
  - [x] 7.1 检查 `.github/workflows/ci.yml` 是否已通过 `npm run check` 覆盖
  - [x] 7.2 如已覆盖则跳过；否则追加显式 step "Verify dist sync"
  - 引用：R1 AC6

---

## Wave 3: 本地便利工具（≈ 1 小时）

- [x] 8. `scripts/dist-resync.sh`
  - [x] 8.1 `--help` / `--yes` flag 解析
  - [x] 8.2 删除 `.tsbuildinfo` 和 `tsconfig.tsbuildinfo`（清理增量缓存）
  - [x] 8.3 `npx tsc` 重新编译
  - [x] 8.4 `git status --porcelain dist/` 捕获变更
  - [x] 8.5 列出变更清单给用户
  - [x] 8.6 交互式提示（`--yes` 跳过）
  - [x] 8.7 `git add dist/` 自动 stage
  - [x] 8.8 打印 `Done. Commit with: git commit -m "chore(dist): resync"`
  - 引用：R2 AC1-5

- [x] 9. package.json 集成
  - [x] 9.1 `scripts.dist:resync` = `bash scripts/dist-resync.sh`
  - 引用：R2 AC2

- [x] 10. 脚本 help 规范
  - [x] 10.1 脚本首行注释 `# category: user-facing`
  - [x] 10.2 `--help` 输出格式符合现有 forge 脚本规范
  - [x] 10.3 加入 `scripts/validate-scripts-help.mjs` 白名单（如需要）

---

## Wave 4: 文档 + Evolved Rules（≈ 45 分钟）

- [x] 11. `CONTRIBUTING.md` 新章节
  - [x] 11.1 在 Code Style 或 Pull Request 章节后追加 "dist/ Sync Requirement"
  - [x] 11.2 4 个子段：Why / Rule / How to fix / Why enforced / Emergency bypass
  - [x] 11.3 cross-ref 到 `078e482` commit 作为历史 motivation
  - 引用：R3 AC1-3

- [x] 12. evolved-rules R6 条目
  - [x] 12.1 `.forge/knowledge/evolved-rules.md` frontmatter 更新 `rule_count: 5 → 6`
  - [x] 12.2 新增 R6 条目（内容见 Design §4.6）
  - [x] 12.3 R6 含 `Infra_Ref` 字段指向脚本 + CONTRIBUTING
  - [x] 12.4 验证 `node scripts/lint-evolved-rules.mjs` 通过
  - [x] 12.5 验证 `node scripts/verify-evolved-rule-infra-refs.mjs` 通过（R6 的 Infra_Ref 能解析）
  - 引用：R4 AC1-5

---

## Wave 5: 验证 + 发布（≈ 30 分钟）

- [x] 13. Smoke test
  - [x] 13.1 基线：跑 `node scripts/check-dist-sync.mjs`，当前 main 应 exit 0
  - [x] 13.2 负面：临时删除 `dist/src/evolved-rules-staleness.js`
  - [x] 13.3 跑 `npm run check`，验证 check-dist-sync 报 "missing in dist"
  - [x] 13.4 跑 `npm run dist:resync --yes`
  - [x] 13.5 再跑 `npm run check`，应全绿
  - [x] 13.6 清理（若有残留）
  - 引用：Design §10 Exit Criteria

- [x] 14. CHANGELOG 更新
  - [x] 14.1 `CHANGELOG.md [Unreleased] > Added` 追加条目：
    - "Added: dist/ Sync Guard (`scripts/check-dist-sync.mjs` + `npm run dist:resync` + CONTRIBUTING 章节 + evolved-rule R6)"
  - [x] 14.2 `[Unreleased] > Fixed` 追加："防止类似 2026-05-10 Sprint 1-3 dist 积压漂移再次发生"

- [x] 15. 完整回归
  - [x] 15.1 `npm run check` 全绿
  - [x] 15.2 `node scripts/lint-evolved-rules.mjs` 通过（rule_count=6 匹配）
  - [x] 15.3 `node scripts/verify-evolved-rule-infra-refs.mjs` 通过
  - [x] 15.4 `npm test` 含新增的 `dist-sync.test.ts` 绿
  - [x] 15.5 `npx tsc --noEmit` 绿

---

## Task Dependencies

```
Wave 1 (core functions) ────────────┐
Wave 2 (CLI) ─────────── depends on Wave 1
Wave 3 (local tool) ────── independent of Wave 1-2
Wave 4 (docs) ─────────── depends on Wave 2 (需 CI 脚本名字)
Wave 5 (verify) ──────── depends on all above
```

## Exit Criteria

1. `scripts/check-dist-sync.mjs` 存在且正确检测三类 drift
2. `scripts/dist-resync.sh` 存在并支持 `--yes` 和交互式
3. `npm run check` 包含 dist-sync 检查且全绿
4. `CONTRIBUTING.md` 有 dist/ Sync Requirement 章节
5. `evolved-rules.md` 含 R6，rule_count=6
6. `test/dist-sync.test.ts` 和 `.property.test.ts` 全绿
7. Smoke test 通过（删 → check fail → resync → check pass）
8. CHANGELOG 已更新
9. `lint-evolved-rules` 和 `verify-evolved-rule-infra-refs` 都通过
