# Forge 分发包

此目录包含 Claude Code 的 Forge 分发包。

## 目录结构

```
dist/
└── claude-code/
    └── bundles/
        └── forge/        # 完整的 Forge skill 包
```

## 使用方式

```bash
# 使用安装脚本（推荐）
bash forge/scripts/install-dist.sh

# 或手动复制
cp -r dist/claude-code/bundles/forge/ ~/.claude/skills/forge/
```

## 源定义 vs 分发包

- `skills/`、`agents/`、`commands/` 等：源定义，维护者视角
- `dist/`：分发包，用户视角

两者功能对齐，但分发包只包含运行所需的文件。

## 构建

```bash
bash forge/scripts/build-dist.sh
```
