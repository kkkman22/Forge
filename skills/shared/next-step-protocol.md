# Next Step Protocol

完成当前阶段后，**必须**使用 AskUserQuestion 询问用户是否继续下一步，而非纯文本输出"下一步 → /forge X"。

## 规则

1. **禁止**纯文本输出下一步提示（如 "下一步：/forge review" 或 "→ /forge review"）
2. **必须**使用 AskUserQuestion 工具，提供以下选项：
   - `继续 /forge <next>` — 执行下一阶段
   - `跳过` — 不继续，停留在当前状态
3. 仅当存在明确的下一步命令时触发（见下表）
4. 失败/阻断时不询问，直接输出问题清单

## 各阶段下一步映射

| 当前阶段 | 成功时下一步 | 失败/阻断时 |
|---------|-----------|-----------|
| /forge decide | /forge spec | 直接输出问题 |
| /forge spec | /forge plan | 直接输出问题 |
| /forge plan | /forge build | 直接输出问题 |
| /forge build | /forge review | 直接输出问题 |
| /forge build-light | /forge review | 直接输出问题 |
| /forge review (通过) | /forge test（标准/全量）或 /forge ship（轻量） | 输出 P0/P1 清单 |
| /forge test | /forge ship | 直接输出失败 |
| /forge ship | /forge learn | 直接输出阻断原因 |

## AskUserQuestion 格式

```
AskUserQuestion:
  questions:
    - question: "继续执行 /forge <next>？"
      header: "Next Step"
      options:
        - label: "继续 /forge <next>"
          description: "<一句话说明该阶段做什么>"
        - label: "跳过"
          description: "停留在当前状态，稍后手动执行"
      multiSelect: false
```

## 示例

build 完成：

```
AskUserQuestion:
  questions:
    - question: "/forge build 完成，继续执行 /forge review？"
      header: "Next Step"
      options:
        - label: "继续 /forge review"
          description: "启动三层独立评审（Spec 对齐、代码质量、安全）"
        - label: "跳过"
          description: "停留在当前状态，稍后手动 /forge review"
      multiSelect: false
```

review 通过（轻量路径）：

```
AskUserQuestion:
  questions:
    - question: "/forge review 通过，继续执行 /forge ship？"
      header: "Next Step"
      options:
        - label: "继续 /forge ship"
          description: "交付变更到目标分支"
        - label: "跳过"
          description: "停留在当前状态"
      multiSelect: false
```
