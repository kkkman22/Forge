[← 返回索引](./INDEX.md) | [English Version](./onboarding-advanced.en.md)

# Forge 高级用户/贡献者引导

> **预计学习时间**：~30 分钟
> **前置知识**：已掌握标准路径，阅读过 [onboarding-daily.md](./onboarding-daily.md)

---

## 你是高级用户吗？

如果你符合以下描述，这条路线适合你：

- 已多次完成标准路径的完整流程
- 需要处理复杂、模糊或架构级别的任务
- 想为 Forge 项目贡献代码或扩展功能
- 对 Forge Loop、Domain Pack、知识系统等高级功能感兴趣

---

## 全量路径

### 与标准路径的区别

| | 标准路径 | 全量路径 |
|--|---------|---------|
| **适用场景** | 需求明确 | 需求模糊或架构变更 |
| **额外阶段** | 无 | decide → spec |
| **后置阶段** | 无 | learn |
| **完整序列** | plan → build → review → test → ship | **decide → spec → plan → build → review → test → ship → learn** |

### decide — 四视角决策

**目的**：在投入实现前，从多个视角审视任务。

**命令**：

```bash
/forge decide
```

**四视角**：

| 视角 | 关注点 | 输出 |
|------|--------|------|
| 产品 | 用户价值、竞品对比 | 功能优先级建议 |
| 架构 | 技术选型、扩展性 | 架构风险评估 |
| 安全 | 威胁模型、数据流 | 安全注意事项 |
| 设计 | UI/UX 影响（如适用） | 设计建议 |

**输出**：`.forge/decisions/ADR-*.md` — 架构决策记录

### spec — 规格锁定

**目的**：将模糊需求固化为可锁定的规格文档。

**命令**：

```bash
/forge spec
# 或从外部文件导入
/forge spec requirements.md
```

**输出**：`.forge/specs/<feature>/spec.md`

**锁定机制**：spec 锁定后进入冻结区，AI 不可修改（除非用户明确解锁）。

### learn — 知识沉淀

**目的**：从本次开发中提取经验，沉淀到知识库。

**命令**：

```bash
/forge learn
```

**五维度提取**：

1. **问题模式** — 遇到什么反复出现的问题？
2. **解决方案** — 如何解决的？
3. **踩坑记录** — 哪些假设是错误的？
4. **决策理由** — 关键决策为什么这么做？
5. **可复用模式** — 哪些模式可以在其他任务中复用？

**输出**：`.forge/knowledge/solutions/*.md` + 更新 `instincts.md`

---

## 知识系统

### 知识库结构

```
.forge/knowledge/
├── catalog.md           # 全景索引（入口）
├── instincts.md         # 经验模式库（置信度评分）
├── known-failures.md    # 已知失败模式
├── metrics.md           # 指标追踪
├── tool-health.md       # 工具健康度
├── skill-feedback.md    # SKILL 执行反馈
├── solutions/           # 解决方案文档
│   └── <topic>.md
└── sessions/            # 会话日志
    └── <date>-<topic>.md
```

### 知识库上限

- 默认上限：**20 个文档**
- 置信度 < 0.3 的模式自动清理
- 高频模式写入 `instincts.md`

### 知识回流

- `/forge plan` 自动搜索相关经验
- `/forge build` 自动搜索历史踩坑记录

---

## Forge Loop

Forge Loop 是独立于 `/forge` 命令的**自主执行引擎**。

### 与 `/forge` 的区别

| | `/forge` | `forge-loop` |
|--|---------|-------------|
| **运行环境** | Claude Code 对话内 | 系统终端 |
| **交互方式** | 人机协作 | 无人值守 |
| **适用场景** | 需要决策的任务 | 批量/重复任务 |

### 快速开始

```bash
# 1. 克隆安装（分发包不含 Forge Loop）
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
cd ~/.claude/skills/forge

# 2. 安装依赖并编译
npm install && npx tsc

# 3. 运行
forge-loop "为所有 API 端点添加输入校验"
```

详见 [reference-advanced.md](./reference-advanced.md) 中的 Forge Loop 完整文档。

---

## Domain Pack

Domain Pack 为特定行业提供开箱即用的领域知识。

### PMS Domain Pack（酒店管理系统）

```bash
# 启用
/forge init --pack pms
```

**包含**：
- 8 个限界上下文术语表
- 4 个状态机（YAML 定义）
- 20 个 Gherkin 场景
- BusinessDayClock 营业日时钟

详见 `packs/pms/README.md`。

---

## 贡献指南

### 如何贡献

1. **Fork 仓库** → 创建功能分支 → 提交 PR
2. **遵循 Forge 工作流**：即使是贡献 Forge 本身，也建议使用 `/forge`
3. **原子提交**：每个逻辑变更一个 commit
4. **Conventional Commits**：`type(scope): description`

### 开发环境

```bash
# 安装依赖
npm install

# 运行测试
npm run check    # tsc + biome + vitest + 脚本检查

# 编译 TypeScript
npx tsc

# 构建分发包
bash scripts/build-dist.sh
```

### 添加新 Skill

```
skills/
└── forge-<name>/
    ├── SKILL.md          # Skill 定义（≤150 行）
    └── references/       # 详细参考文档
        └── *.md
```

要求：
- SKILL.md 必须含 `name`、`description` frontmatter
- 使用 `disable-model-invocation: true` 防止直接调用
- 详细内容放入 `references/`

---

## 实操练习：完成一次全量路径

### 目标

使用全量路径评估是否为 Forge 添加一个新命令。

### 起始状态

- 已掌握标准路径
- 当前在功能分支

### 操作步骤

1. **启动 decide**

   ```bash
   /forge decide
   # 任务描述：为 Forge 添加 "/forge backup" 命令，用于备份 .forge/ 状态
   ```

2. **审查决策报告**
   - 查看四视角分析
   - 确认架构风险可接受

3. **执行 spec → plan**
   - Forge 自动生成 spec 和 plan
   - 审查并批准 plan

4. **完成 build → review → test → ship**
   - 观察自动推进

5. **执行 learn**
   - 提取本次开发的经验
   - 检查知识库更新

### 预期结果

- ADR 决策记录
- 锁定的 spec 文档
- 批准的 plan
- 实现代码 + 测试
- 知识库更新

---

## 继续探索

- **[复杂需求工作流 → workflow-complex.md](./workflow-complex.md)** — 查看全量路径完整示例
- **[架构参考 → reference-architecture.md](./reference-architecture.md)** — 深入了解内部机制
- **[安全参考 → reference-security.md](./reference-security.md)** — 了解安全机制细节
