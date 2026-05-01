# React Todo 示例项目

这是一个使用 Forge 工作流管理的 React + TypeScript Todo 应用示例。

## 项目结构

```
react-todo/
├── .forge/              # Forge 配置目录
│   ├── config.md        # 项目配置
│   ├── status.md        # 当前状态
│   ├── specs/           # 需求规格
│   └── plans/           # 执行计划
├── src/                 # 源代码
└── README.md
```

## 使用 Forge

### 1. 添加新功能

```bash
# 通过 Forge 路由添加新功能
/forge 为 Todo 添加拖拽排序功能
```

Forge 会分析任务复杂度，建议合适的执行路径（Light/Standard/Full）。

### 2. 查看项目状态

```bash
/forge status
```

### 3. 执行开发流程

```bash
# 标准路径
/forge plan .forge/specs/todo-app/spec.md
/forge build .forge/plans/todo-app.md
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

- React 18+
- TypeScript（strict 模式）
- Vitest（测试框架）
