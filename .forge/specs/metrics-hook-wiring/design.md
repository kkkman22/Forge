# 接线 metrics 采集 hook — 设计文档

## 概述

在 `.claude-plugin/plugin.json` 注册 `UserPromptSubmit` hook 调用已存在的 `scripts/metrics-recorder.mjs`,让使用率数据落到 `.forge/.metrics/`。零行为变更,解锁 ROADMAP 所有 pending 的"基于使用率"评估。不修改采集逻辑,只接线。

## 设计决策

### D1: hook 注册在 plugin.json,非 hooks/hooks.json

- **问题**:hook 注册在哪个文件?
- **候选方案**:
  - A. `.claude-plugin/plugin.json` 的 hooks 字段(plugin 级,随插件安装生效)
  - B. `hooks/hooks.json`(项目级,需手动配置)
- **选择**:**A**
- **理由**:metrics 采集是 Forge plugin 的内置能力,应随插件安装自动生效,不需用户额外配置;`hooks/hooks.json` 更适合项目特定 hook(如 evolved-rules 注入,已在那);plugin.json 是 Claude Code plugin 的标准 hook 注册点。
- **风险与缓解**:plugin.json 的 hooks 字段格式需对齐 Claude Code 规范——实现时参考 `.githooks/` 和 `hooks/hooks.json:3,17`(inject-evolved-rules)的写法确认字段名/matcher。

### D2: hook 非阻断,失败静默

- **问题**:metrics-recorder 失败时是否阻断用户 prompt?
- **选择**:**绝不阻断,失败静默**
- **理由**:metrics 是观测设施,挂了不能影响用户工作;UserPromptSubmit hook 若返回非零退出码可能阻断提交(取决于 Claude Code 行为),因此 metrics-recorder.mjs 内部 try/catch 兜底,且 hook 配置明确不阻断。
- **实现**:`metrics-recorder.mjs` 顶层 try/catch,任何异常 → exit 0 + stderr 静默日志;plugin.json hook 配置若支持 `blockOnFailure: false` 则显式设置。

### D3: 只采命令名,不存 prompt 全文

- **问题**:采集多少 prompt 内容?
- **选择**:**仅提取 `/forge <sub>` 的 sub 命令名,不存 prompt 全文**
- **理由**:使用率统计只需命令分布(如 grill 被调几次);存 prompt 全文是隐私风险且无必要;符合 Non-Goals"不采集 prompt 全文隐私"。
- **实现**:metrics-recorder.mjs 解析 prompt,若匹配 `/forge\s+(\S+)/` 则记录 sub 命令,否则归类为 "natural-language"(供 router 路由的描述式调用统计)。

### D4: .forge/.metrics/ 忽略入 git

- **问题**:.forge/.metrics/ 是否提交?
- **选择**:**加入 .gitignore**
- **理由**:metrics 是个人/本地使用数据,提交会污染 repo 且暴露个人习惯;聚合统计由 `aggregate-metrics.mjs` 在本地跑;若团队需要汇总,可手动导出。
- **风险与缓解**:团队无法自动汇总——接受,未来若需要可加 opt-in 上报机制(本 spec 不含)。

## 接口设计

### plugin.json hooks 字段(新增)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/metrics-recorder.mjs"
          }
        ]
      }
    ]
  }
}
```
> 实现时确认 Claude Code 的确切字段名(matcher/hooks/type/command)与变量(${CLAUDE_PLUGIN_ROOT})是否支持。

### metrics-recorder.mjs 输入

- 通过 stdin 或环境变量接收 prompt 内容(确认 UserPromptSubmit hook 的数据传递机制)
- 提取 `/forge <sub>` 命令名或标记为 natural-language

### 输出

- `.forge/.metrics/<date>-commands.jsonl`(append-only,与 runs/ 事件流格式一致)
- 每行:`{ts, sub?, kind: "slash"|"natural"}`

## 数据模型

无 schema 变更。新增 `.forge/.metrics/` 目录(运行时创建)。

## 风险

| 风险 | 缓解 |
|------|------|
| UserPromptSubmit hook 字段格式与 Claude Code 规范不符 | 实现时先查 Claude Code hook 文档 + 参考 hooks/hooks.json 写法;`forge-doctor` 可加 hook 健康检查 |
| hook 增加每次 prompt 提交延迟 | metrics-recorder < 100ms(纯本地追加);实测验证 |
| 非 forge 项目误触发 | metrics-recorder 检查 `.forge/` 不存在则立即 exit 0 |
| prompt 隐私泄露 | D3 决策只采命令名,不存全文 |
| 并发 prompt 竞态 | append-only O_APPEND 写入(对齐 context-injection.ts 语义) |
| .gitignore 漏配导致提交 | Requirement 2.3 明确评估 .gitignore,实现时验证 |
