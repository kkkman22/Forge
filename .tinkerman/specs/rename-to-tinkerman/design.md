---
spec: rename-to-tinkerman
status: pending
---

# Design — 5 批 + 兼容策略

## 批次依赖（必须按序）
`批次1 元数据` → `批次2 命令+scripts` → `批次3 .tinkerman/目录` → `批次4 文档全文` → `批次5 marketplace+repo`

每批独立 feature 分支，跑验证后合并，再开下一批。不可跳批（后批依赖前批命名落地）。

## `.tinkerman/` → `.tinkerman/` 兼容策略（最大风险点）

这是整个改名中唯一可能破坏**组织记忆连续性**（ADR-0009 保留 #4）的步骤。

1. **迁移脚本** `scripts/migrate-forge-to-tinkerman.mjs`：
   - 递归读 `.tinkerman/` 写 `.tinkerman/`
   - 校验：文件数一致 + 每文件 SHA256 一致
   - dry-run 模式（`--dry-run`）先验，再实跑
   - 失败回滚（保留 `.tinkerman/` 原样，不删）
2. **双路径读取兼容期**（≥2 版本）：
   - 所有读状态目录的 src/scripts 加 fallback：先 `.tinkerman/`，找不到再 `.tinkerman/`
   - `init.sh` 新装创建 `.tinkerman/`；旧装走迁移脚本
   - 兼容期结束（N 版本后）移除 fallback + 提示用户删 `.tinkerman/`
3. **160 处 `.tinkerman/` 引用**（src/scripts）：逐批改 `.tinkerman/` + fallback，grep 验证无遗漏

## `/forge` 命令兼容
- dispatcher 同时注册 `/tinkerman`（主）+ `/forge`（alias），≥1 版本
- `/forge` 触发时 stdout 一行 deprecation 提示
- alias 在移除 `.tinkerman/` fallback 的同一版本移除

## 验证策略（每批）
- 基线：`tsc --noEmit && biome check src/ test/ && vitest run && node scripts/check-dist-sync.mjs`
- 批次2 额外：hooks.json×4 路径 grep + hook-path-safety 测试
- 批次3 额外：迁移脚本 dry-run + `.tinkerman/` 文件数 = `.tinkerman/` + 内容哈希校验 + 全量 vitest
- 批次5 额外：`scripts/smoke-install.sh` + plugin install 端到端

## 风险与缓解
| 风险 | 缓解 |
|------|------|
| `.tinkerman/` 迁移丢数据 | 迁移脚本校验 + 不删原目录 + 备份 |
| 1329 引用遗漏 | grep 验证 + 全量 vitest + check-dist-sync |
| 外部引用（文章/分享/旧 repo URL） | GitHub rename 自动重定向；README 注明 |
| hooks.json 4 副本不同步 | 批次2 统一处理 + hook-path-safety 测试守 |
| 已安装用户 plugin 名变了 | marketplace 旧名 deprecated + 兼容期提示 |

## 回退
每批独立分支 + commit，任一批验证失败 → 该批 abort，前一批已合并的不受影响。
