# .claude/agents/ — 派生目录(自动生成,勿手编)

> **⚠️ 本目录全部是 symlink,指向 `../../agents/` 唯一源。禁止手工编辑本目录文件。**

## 修改 agent 的正确方式

1. 编辑 `agents/<name>.md`(唯一源)。
2. symlink 自动反映更改,无需操作本目录。
3. 运行 `node scripts/check-agent-links.mjs` 验证 symlink 完整性。

## 为什么是 symlink

ADR-0010: `agents/` 是唯一真相源,本目录全 symlink 指向它。
symlink 是 git 原生(mode 120000)、零运行时、永无漂移。

## 新增 agent

```bash
# 在 agents/ 创建源文件后
ln -s ../../agents/<name>.md .claude/agents/<name>.md
node scripts/check-agent-links.mjs   # 验证
```

## 门禁

`check-agent-links.mjs` 会校验本目录所有文件都是有效 symlink;
非 symlink 实体文件会触发 NOT_SYMLINK 错误,阻断 `npm run check`。

## 参考

- ADR-0010:symlink 统一架构
- `agents/README.md`:唯一源约定
