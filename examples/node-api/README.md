# Node.js API 示例项目

这是一个使用 Forge 工作流管理的 Node.js + Express + TypeScript REST API 示例。

## 项目结构

```
node-api/
├── .forge/              # Forge 配置目录
│   ├── config.md        # 项目配置
│   ├── status.md        # 当前状态
│   ├── specs/           # 需求规格
│   └── plans/           # 执行计划
├── src/                 # 源代码
└── README.md
```

## 使用 Forge

### 1. 添加新 API 端点

```bash
/forge 为用户 API 添加搜索和排序功能
```

### 2. 查看项目状态

```bash
/forge status
```

### 3. 执行开发流程

```bash
# 标准路径
/forge plan .forge/specs/user-api/spec.md
/forge build .forge/plans/user-api.md
/forge review
/forge test
/forge ship
```

## Forge 工作流说明

- **Spec**（`.forge/specs/`）：锁定后不可修改，确保需求稳定
- **Plan**（`.forge/plans/`）：批准后不可修改，确保执行计划稳定
- **Review**：三层评审（spec-check、quality-check、security-check）
- **Ship**：通过所有检查后自动提交

## 技术栈

- Node.js 20+
- Express 4.x
- TypeScript（strict 模式）
- Vitest（测试框架）
