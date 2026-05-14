# Refactor Method Library

四层分类，scan 阶段按此匹配候选，design 阶段每步引用方法名。

## L1 — Behavioral Equivalence Migration (lowest risk)

- **Rename** — 重命名变量、函数、类型
- **Move** — 移动文件或导出
- **Extract Constant** — 提取魔法值为命名常量
- **Extract Type** — 提取内联类型为独立 type/interface
- **Inline** — 内联单次使用的变量/函数

## L2 — Fowler Classics (medium risk)

- **Extract Method** — 提取 >30 行逻辑为独立函数
- **Extract Class** — 提取职责为独立类
- **Replace Conditional with Polymorphism** — 条件分支 → 策略模式
- **Introduce Parameter Object** — >3 参数 → 单一对象
- **Replace Temp with Query** — 临时变量 → 计算函数
- **Encapsulate Field** — 公开字段 → getter/setter

## L3 — Structural Split (higher risk)

- **Split Module** — 大文件拆分为职责单一的多个模块
- **Split Class** — 多职责类拆分
- **Introduce Facade** — 复杂子系统 → 简化接口
- **Extract Layer** — 混合逻辑 → 分层（如 UI/logic/data）

## L4 — Performance (requires measurement)

- **Lazy Loading** — 延迟加载重资源
- **Caching** — 缓存计算结果
- **Batch Processing** — 批量处理替代逐条
- **Memoization** — 纯函数结果缓存

## Usage

Scan 阶段对候选标注 L1-L4 级别和具体方法名。Design 阶段每步引用一个方法名。Apply 阶段每步执行一个方法库方法。
