# Spec 1: Prompt 注入防御 — 四层纵深防御系统

> 来源：open-gsd/gsd-core v1.4.4 `hooks/gsd-prompt-guard.js` + `hooks/gsd-read-injection-scanner.js` + `scripts/prompt-injection-scan.sh` + `src/security.cjs`
> 优先级：P1 | 影响范围：新增 2 个 PreToolUse/PostToolUse Hook + 1 个扫描脚本 + 输入验证
> 预估工作量：4-6h
> Forge 现状：✅ 已通过现有实现满足 — `scripts/forge-prompt-guard.js` + `scripts/forge-read-injection-scanner.js` + 39 regex patterns + hooks registered

---

## 评估结论（2026-06-12）

**✅ 已通过现有实现满足，无需开发。**

Forge 已完整实现本 Spec 的全部需求：PreToolUse Hook（Write/Edit）、PostToolUse Hook（Read）、CI 扫描脚本、Unicode 检测（U+200B-200F, U+202A-202E, U+FEFF, U+00AD, U+2060, U+E0000-E007F）、Markdown 链接 XSS 扫描、压缩存活模式检测、fail-open 设计、Claude Code 环境检测 + 豁免。

## 问题

Agent 处理外部内容时面临 prompt 注入风险。以下场景存在真实威胁：

| 场景 | 风险 | 示例 |
|------|------|------|
| 读取外部 README | 恶意 README 嵌入"忽略之前的指令" | 开源依赖的 README.md 中夹带注入指令 |
| 写入 `.forge/` 文件 | 攻击者通过 issue 提供的"复现代码"包含注入 | 用户粘贴的代码片段中含 `<system>` 标签 |
| 上下文压缩 | 注入指令在压缩后变成"可信上下文" | 长文件被 summarize 时，"总结时保留此内容"存活下来 |
| 不可见 Unicode | 零宽字符、RTL 覆盖、Unicode tag block | 外观正常但包含隐藏指令 |
| Markdown 链接 XSS | `javascript:` / `data:` URI 注入 | 看似正常的链接实际执行恶意代码 |

GSD Core v1.4.4 的解决方案是 **四层纵深防御**：

| Layer | 组件 | 时机 | 行为 |
|-------|------|------|------|
| Layer 1 | `security.cjs` 输入验证 | 参数传递 | 路径遍历 + 原型污染 + shell 参数验证 |
| Layer 2 | `gsd-prompt-guard.js` | PreToolUse Write/Edit | 14 regex 模式 + Unicode 检测，advisory |
| Layer 3 | `gsd-read-injection-scanner.js` | PostToolUse Read | 压缩存活模式 + Markdown 链接 XSS + Unicode tags |
| Layer 4 | `prompt-injection-scan.sh` | CI | 全仓库扫描，allowlist，exit 0/1/2 |

所有 Hook 遵循 **fail-open** 设计——错误时不阻断正常工作流。

### v1.4.4 新增 vs v1.3.0

| 特性 | v1.3.0 | v1.4.4 |
|------|--------|--------|
| 层级 | 3 层（Write/Read/CI） | **4 层**（+输入验证 Layer 1） |
| Unicode 检测 | 部分 | **完整**（U+200B-200F, U+202A-202E, U+FEFF, U+00AD, U+2060, U+E0000-E007F） |
| Markdown XSS | 无 | **javascript:/data:/userinfo/token-in-query** |
| 压缩存活 | 无 | **7 种压缩存活模式** |
| CI exit code | 0/1 | **0/1/2**（2=strict mode violation） |

## 需求

### R1: 写保护 Hook — `forge-prompt-guard`

**类型**：PreToolUse Hook
**触发**：Write / Edit 工具目标为 `.forge/` 目录下的文件
**行为**：advisory-only（不阻断），输出警告到 stderr

扫描以下模式：

```
## 指令覆写类
- "ignore (previous|all|above|earlier) instructions"
- "disregard (previous|above) (instructions|rules)"
- "forget (everything|all)"

## 角色操纵类
- "you are now (a|an)"
- "new instructions?:"
- "your (new )?role (is|should be)"

## 系统标签注入类
- "<system>", "<assistant>", "<human>", "<user>"
- "[SYSTEM]", "[INST]", "<<SYS>>", "<|im_start|>"
- "<!-- system", "<!-- assistant"

## 工具调用注入类
- "use (the )?(Read|Write|Edit|Bash) tool"
- "call (the )?function"
- "execute (the )?(following )?command"

## 越狱/DAN 类
- "DAN (mode|jailbreak)"
- "developer mode"
- "bypass (your|the) (restrictions|rules|guidelines)"
```

**不可见 Unicode 检测**：
- U+200B-200F（零宽字符、方向标记）
- U+202A-202E（RTL 覆盖）
- U+FEFF（BOM）
- U+00AD（软连字符）
- U+2060（字连接符）
- U+E0000-E007F（Unicode tag block — 不可见指令注入向量）

**严重度分级**：
- `LOW`：匹配 1-2 个模式
- `HIGH`：匹配 ≥3 个模式

**Claude Code 豁免**：检测到 Claude Code 原生环境时（`CLAUDE_CODE_ENTRYPOINT` env var）跳过写保护，因为 Claude Code 有原生 read-before-edit 机制。

### R2: 读保护 Hook — `forge-read-injection-scanner`

**类型**：PostToolUse Hook
**触发**：Read 工具返回内容后
**行为**：advisory（不阻断，但输出警告）

继承 R1 所有标准模式，额外增加 **压缩存活模式检测**：

```
## 压缩存活类（专门检测旨在"活过上下文压缩"的指令）
- "when (summariz|compress|condens|abbreviat)"
- "retain (this|the following|above) (when|if|during)"
- "do not (remove|omit|exclude|delete|summarize)"
- "always include (this|the|in)"
- "preserve (this|the following|above)"
- "important: (do not|never|always|must)"
- "this (is|must be) (critical|essential|required|mandatory)"
```

**Markdown 链接扫描**：
- `javascript:` URI
- `data:` URI（非 `data:image/` 开头的）
- URL 中包含 userinfo credentials（`http://user:pass@`）
- URL query string 中包含 token/key/secret 参数

**排除路径**（不扫描）：
- `.forge/reviews/` — review 产物本身需要引用安全模式
- `.forge/knowledge/` — 知识库内容
- Hook 源码文件自身
- 安全相关文档（SECURITY.md 等）

### R3: CI 扫描脚本 — `scripts/prompt-injection-scan.sh`

独立于 Hook 的 CI 扫描脚本，扫描整个仓库中的 `.md`、`.js`、`.ts`、`.sh`、`.json`、`.yml` 文件。

```
功能：
1. 扫描标准注入模式（同 R1 模式集）
2. 支持 .prompt-scan-ignore 排除文件
3. 支持 # allow: reason="..." owner="..." expires="YYYY-MM-DD" 行内标注
4. 输出结构化结果：文件:行号:模式:严重度
5. 退出码：0=通过，1=发现注入模式，**2=strict 模式违规**（v1.4.4 新增）
6. --strict 模式（CI 用）：忽略 allow 标注，所有匹配均视为违规
```

**Base64 解码扫描**（可选，从 GSD Core 的 `base64-scan.sh` 借鉴）：
- 提取 ≥40 字符的 base64 blob
- 解码后检查 ≥70% 可打印文本
- 对解码内容运行注入模式扫描
- 使用 `LC_ALL=C` 做 locale 硬化

### R4: Hook 注册

在 `.claude/settings.json` 或 `.claude/settings.local.json` 注册：

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/forge-prompt-guard.js 2>/dev/null || true"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/forge-read-injection-scanner.js 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### R5: Fail-Open 铁律

所有注入防御 Hook 必须遵循：

> **错误时 exit 0，永不因 Hook 错误阻断正常工作流。** 只有明确的注入检测才输出警告。脚本语法错误、文件读取失败、正则异常等全部静默处理。

## 设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 阻断 vs 警告 | 阻断/警告 | 警告（advisory-only） | Forge 的 No-Confirmation 铁律要求不阻断流程；警告信息足以让开发者注意到风险 |
| Hook vs Agent | Hook/Agent | Hook | 注入扫描需要拦截工具调用，Agent 层无法拦截 Read/Write |
| 独立脚本 vs 内联 | 独立脚本/内联 | 独立脚本 | 便于 CI 复用 + 单独测试 + 不污染 agent 上下文 |
| 模式集来源 | 自研/借鉴 GSD | 借鉴 + 扩展 | GSD Core 的模式集经过 681 个测试文件验证；中文环境需额外添加中文注入模式 |

## 验收标准

- [ ] `scripts/forge-prompt-guard.js` 实现写保护 Hook（PreToolUse, Write|Edit）
- [ ] `scripts/forge-read-injection-scanner.js` 实现读保护 Hook（PostToolUse, Read）
- [ ] `scripts/prompt-injection-scan.sh` 实现 CI 扫描脚本
- [ ] Hook 注册到 `.claude/settings.json`（或 `.claude/settings.local.json`）
- [ ] 所有 Hook 遵循 fail-open 设计（错误 exit 0）
- [ ] 包含不可见 Unicode 检测（含 Unicode tag block U+E0000-E007F）
- [ ] 包含压缩存活模式检测
- [ ] Claude Code 环境检测 + 豁免
- [ ] 排除路径正确（reviews、knowledge、hook 源码）
- [ ] `npm run check` 通过
