# Security Policy

Forge 是 Claude Code 的 skill 包，作用于用户本地开发环境。本文档约定漏洞报告流程、响应时限、支持版本以及 CVE 记录格式。

## Reporting a Vulnerability

请**不要**在公开 issue 中提交安全漏洞。优先选择以下渠道之一：

1. **GitHub Security Advisory**（推荐）
   访问 <https://github.com/kkkman22/Forge/security/advisories/new> 提交私有报告。
2. **Email**
   如无法使用 GitHub Security Advisory，发送邮件至维护者（项目 `package.json` 中的 `author` 或 `maintainers` 字段，或 README 中列出的联系方式）。

报告内容建议包含：

- 受影响版本 / commit hash
- 漏洞类型（prompt injection、command injection、supply chain 等）
- 复现步骤（最小可复现示例）
- 潜在影响范围（本地代码泄露、会话接管、文件系统越权）
- 建议的修复方向（可选）

## Response SLA

| 阶段 | 时限 |
|---|---|
| 初步响应（确认收到报告） | ≤ 3 个工作日 |
| Critical 漏洞修复发布 | ≤ 14 天 |
| High 漏洞修复发布 | ≤ 30 天 |
| Medium / Low 漏洞修复 | 纳入下一个 minor 版本 |

Critical 的定义：无需用户交互即可触发的远程代码执行、凭证/密钥泄露、bypass 冻结区保护写入受保护文件。其他漏洞按 CVSS 3.1 评分对照分级。

## Supported Versions

当前支持的版本：

| 版本 | 状态 | 备注 |
|---|---|---|
| `main` 分支最新 tag | ✅ 活跃维护 | 安全修复优先进入此分支 |
| 前一个 minor 版本 | ✅ 关键安全修复 | 仅 critical / high 漏洞 backport |
| 更早版本 | ❌ 不再维护 | 请升级到受支持版本 |

Forge 遵循 SemVer。安全修复通常以 patch 版本发布（例如 v2.3.1 → v2.3.2）。

## CVE / GHSA Record Format

每个被分配 CVE 或 GitHub Security Advisory 编号的漏洞都会在 `CHANGELOG.md` 的对应版本条目中以 `[SECURITY]` 前缀记录。格式如下：

```markdown
## [v2.3.1] — YYYY-MM-DD

### Fixed
- [SECURITY] CVE-YYYY-NNNNN / GHSA-xxxx-yyyy-zzzz
  - **Severity**: critical | high | medium | low
  - **Impact**: <一句话描述漏洞影响>
  - **Affected**: <受影响的版本范围>
  - **Mitigation**: <缓解措施或升级路径>
  - **ADR**: ADR-NNNN（关联的架构决策记录）
  - **Credit**: <报告者署名，已获授权>
```

每条 `[SECURITY]` 条目**必须关联至少一个 ADR**，ADR 位于 `.forge/decisions/ADR-*.md`，用于记录漏洞根因分析与修复决策的长期追溯。

## Out of Scope

以下场景不视为 Forge 的安全漏洞（但欢迎以 bug 或 feature request 形式反馈）：

- 用户主动向 `/forge` 命令输入恶意指令而**未使用**内置 `prompt-defense` 层拦截时触发的行为
- 第三方 Claude Code 扩展或用户自定义 agent 引入的漏洞
- 用户本地 git 配置或 shell 环境被篡改导致的 shell 注入
- Claude API 本身的安全问题（请直接向 Anthropic 报告）

## Plugin Distribution Trust Model

Forge 通过 Claude Code Plugin 系统分发。安全模型：

- **安装来源**：`claude plugin marketplace add` 锁定到 GitHub repo URL，commit SHA 校验
- **版本锁定**：`claude plugin install forge@<tag>` 锁定到特定 tag，防止供应链漂移
- **更新验证**：`claude plugin update` 需要 `claude plugin validate` 通过
- **企业管控**：管理员可通过 `blockedMarketplaces` / `allowedChannelPlugins` 策略管控
- **项目级隔离**：`.forge/` 目录始终在项目本地，plugin 更新不影响项目状态
- **Plugin 不含第三方 MCP**：基础 plugin 不捆绑任何 MCP server

## Acknowledgements

感谢所有负责任披露漏洞的研究者。在征得报告者同意后，会在 SECURITY.md 的致谢列表或 `CHANGELOG.md` 的 `[SECURITY]` 条目中署名。
