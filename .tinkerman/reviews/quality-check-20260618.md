---
layer: quality-check
topic: mcp-compression-delegation
date: 2026-06-18
status: pass
severity_counts: { p0: 0, p1: 0, p2: 1, p3: 3 }
---

# quality-check — mcp-compression-delegation

## Findings

- [P2|0.8] R-001: Layer 编号在测试与文档间不一致,且测试自述与现行文档矛盾 @ test/context-explosion-defense.integration.test.ts:5-12,33,69,100
  重写后的 context-budget.md 把运行时防护编号为 Layer 1=阶段隔离、Layer 2=Subagent 文件化返回、Layer 3=Resume 最小化、Layer 4=Read 预算监控。但集成测试仍用旧编号:describe 块写成 "Layer 3: Subagent..."、"Layer 4: Phase-aware plan injection"、"Layer 5: Read budget tracking",且 docstring 声称 "Layer 2 (Phase boundary budget) used the read-cache index and was removed"。后者与 context-budget.md 直接矛盾——Phase Boundary Gate 在新文档里仍是 Layer 1 且未移除。建议把 describe/docstring 统一对齐到 1-4 新编号。
- [P3|0.7] R-002: 源码注释中英混排 @ src/mcp/trimmers/output.ts:55
  英文 doccomment 中嵌了一个中文词 "which zero-compresses them in实测"。建议改为 "in practice/measured"。
- [P3|0.6] R-003: formatFailureOutput 退化为单点私有函数 @ src/mcp/trimmers/output.ts:40-42
  重写后该函数仅被 trimCommandOutput 唯一调用(line 65),无其他引用。函数体只有一行三元。可内联以减少间接层;保留亦无错(命名清晰、注释点明 Iron Law),属可选清理。
- [P3|0.5] R-004: dist 中残留已删测试的旧产物 @ dist/test/mcp/forge-exec-rtk.test.* / forge-read-cached.test.* / read-cache*.test.*
  diff 显示删除了 src 的 read-cache/forge-read-cached/RTK,但 dist/ 下仍有这些已删测试的 .js/.d.ts/.js.map。若 dist 是 build 产物、下次 build 会重建则无影响。建议确认 dist 是否纳入 build 重建流程。

## 测试覆盖评估

- **Iron Law 覆盖**: 充分。删除的 forge-exec-rtk.test.ts 其行为已在 test/mcp/output-trimmer.test.ts 的 "failure passthrough" describe 块等价覆盖(exitCode=1/2、带 stderr、stderr-only、空输出,lines 100-127,138-146),并由 output-trimmer.property.test.ts 的属性测试加固。forge_exec 端 exitCode≠0 仍走 trimCommandOutput→formatFailureOutput,路径完整。
- **trimmer 覆盖**: 充分。output-trimmer.test.ts(阈值边界 30/31 行、key line 15 上限、tail 5 行) + output-trimmer.property.test.ts(15 处调用含边界) + forge-exec.test.ts:336-373(集成层应用)。
- **悬空引用**: 无。src 全量 grep 未发现 isRtkAvailable/trimWithFallback/forge-read-cached/read-cache import。test 中仅 2 处历史性文案注释,均非代码引用。tsc --noEmit 退出 0,无悬空 import。

## 代码质量评估

- **命名/注释**: 良好。output.ts 常量命名清晰,顶部 doccomment 准确反映新策略。唯一瑕疵是 R-002 的中英混排。forge-exec.ts:586-588 新注释清楚说明了 Iron Law + Headroom fallback 双语义。
- **错误处理**: 完整。移除 RTK 的 async 探测后,forge_exec 调用路径变简单:原双分支简化为单一同步 trimCommandOutput。无 async/await 不匹配。失败路径(exitCode≠0 / timedOut / spawn 失败)三处均保留并各自返回 isError:true。
- **死代码**: 基本无。RTK 相关 import/isRtkAvailable/trimWithFallback 已彻底清除。formatFailureOutput 单点使用(R-003,可选内联)。dist 残留(R-004)属构建产物层面。
- **性能**: 改善。消除每次 forge_exec 调用的 isRtkAvailable async 探测(原 spawn rtk --version + 3s timeout 缓存),trimmer 调用从异步降为同步,减少一次 microtask 切换。
- **可维护性**: 良好但有 1 处文档漂移(R-001)。context-budget.md 内部 Layer 1-4 自洽且表格/正文一致;但集成测试未同步重编号,且 docstring 关于 Phase boundary 被移除的叙述与文档保留该层相矛盾。

## 结论

status=pass。代码改动本身干净——tsc 零错误、无悬空引用、Iron Law 与 trimmer 行为有等价测试覆盖、调用路径简化无 async 不匹配。4 个 findings 全为 P2/P3,无 P0/P1,不阻塞发布。建议发布前至少处理 R-001(测试与文档 Layer 编号对齐)。
