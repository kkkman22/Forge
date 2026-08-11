---
updated: 2026-08-11
---
# Charter Subcommand Details

## `/tinkerman charter init` — 交互式创建

### 项目扫描

1. 扫描项目结构推断技术选型：
   - `package.json` → 语言、框架、包管理器
   - `tsconfig.json` → TypeScript 配置
   - `Cargo.toml` → Rust 技术栈
   - `go.mod` → Go 技术栈
2. 扫描 `.tinkerman/decisions/` 提取已有 ADR 的架构决策
3. 扫描 `.tinkerman/specs/` 提取已有 spec 的约束

### 交互式问答

基于扫描结果，通过 `AskUserQuestion` 逐章节确认内容（每次一个问题）：

1. **核心问题**：本项目要解决什么工程问题？（提供推断结果作为默认值）
2. **架构边界**：模块划分和通信契约
3. **技术选型基线**：确认或补充扫描到的技术栈
4. **不可变量**：建议 1–3 条初始 invariants（基于 ADR 和技术栈推断）
5. **约定与偏好**：命名规范、测试策略等（可选，可跳过）

### 生成

- 基于 `templates/charter-template.md` 模板
- 填入扫描结果和用户确认的内容
- Frontmatter `status: draft`（需用户后续通过 `update` 激活）
- 写入 `.tinkerman/charter.md`
- 总长度不超过 150 行

## `/tinkerman charter update` — 交互式更新

### 前置检查

- `.tinkerman/charter.md` 不存在 → 提示运行 `init`，停止
- 存在 → 读取并解析

### 一致性扫描

检测 charter 与当前代码库的不一致：
- 技术选型基线 vs 实际依赖
- Invariants vs 代码（简化版 check）
- 架构边界 vs 目录结构

### 交互式审视

对每个章节询问用户：保留 / 更新 / 标记为过时

### 变更日志触发原因

每次变更日志条目的"触发"字段必须从以下三类中选择：

| 触发源 | 含义 |
|--------|------|
| `手动` | 用户主动运行 `/tinkerman charter update` |
| `spec 触发` | 下游 skill（decide/spec/plan）检测到 charter drift 后触发更新 |
| `check 触发` | `/tinkerman charter check` 发现违规后触发更新 |

### 版本更新规则

| 变更类型 | 版本变更 | 示例 |
|---------|---------|------|
| 删除/修改 invariant | Major（2.0.0） | INV-001 被移除 |
| 新增 invariant/boundary/baseline | Minor（1.1.0） | 新增 INV-004 |
| 描述修正/理由补充 | Patch（1.0.1） | 修正 INV-002 描述 |

### Major Bump 影响报告

当版本发生 major bump：扫描 `.tinkerman/specs/` 和 `.tinkerman/decisions/`，标记引用了被修改/删除 invariant 的文档，输出影响报告。

## `/tinkerman charter check` — 非交互式校验

### 前置检查

- 不存在 → 输出 `ℹ No charter found`，exit 0
- `status: draft` → 输出 `ℹ Charter is in draft status`，exit 0
- `status: deprecated` → 输出 `ℹ Charter is deprecated`，exit 0
- `status: active` → 继续

### Invariant 检查

对每个 invariant 解析规则文本，生成 grep/glob 模式检查代码库。示例检查：
- **TypeScript strict**: `grep '"strict":' tsconfig.json` + `grep -r '@ts-ignore\|any' src/`
- **API versioning**: `grep -r '/api/v[0-9]' src/`
- **No direct DB**: `grep -r 'raw SQL\|\.query\|\.execute' src/ --include='*.ts'` 排除 repository 层

### 输出格式

```
✅ INV-001: TypeScript strict mode — no violations
❌ INV-003: No direct DB access — found 2 violations:
  - src/services/analytics.ts:42
  - src/utils/report.ts:15
```

Exit code: 全部合规 → 0，存在违规 → 1

## `/tinkerman charter show` — 显示内容

读取 `.tinkerman/charter.md`，不存在则输出 `ℹ No charter found`。
