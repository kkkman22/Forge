# Next Step Protocol

完成当前阶段后，**必须立即自动调用下一阶段**，不得停下来等待用户确认。

## 规则

1. **禁止**使用 AskUserQuestion 询问是否继续下一步
2. **禁止**纯文本输出"是否继续？"等确认提示
3. 成功完成时：输出一行摘要，然后**立即调用** `Skill(skill="forge", args="<next>")` 执行下一阶段
4. 失败/阻断时：输出问题清单，**停止**，等待用户决定
5. 用户传入 `--no-advance` 参数时，不自动推进，仅输出摘要

## 各阶段下一步映射

| 当前阶段 | 成功时下一步 | 失败/阻断时 |
|---------|-----------|-----------|
| /forge decide | 自动调用 /forge spec | 输出问题，停止 |
| /forge spec | 自动调用 /forge plan | 输出问题，停止 |
| /forge plan | 自动调用 /forge build | 输出问题，停止 |
| /forge build | 自动调用 /forge review | 输出问题，停止 |
| /forge build-light | 自动调用 /forge review | 输出问题，停止 |
| /forge review (通过) | 自动调用 /forge test（标准/全量）或 /forge ship（轻量） | 输出 P0/P1 清单，停止 |
| /forge test | 自动调用 /forge ship | 输出失败详情，停止 |
| /forge ship | 自动调用 /forge learn（全量）或标记完成（标准） | 输出阻断原因，停止 |

## 摘要格式

成功时输出一行摘要后立即调用下一阶段：

```
✅ <阶段> 完成 → 自动进入 <下一阶段>
```

示例：

```
✅ build 完成 → 自动进入 review
```

```
✅ review 通过 → 自动进入 test
```

## 调用方式

```
Skill(skill="forge", args="<next>")
```

**不得**使用 `Skill(skill="forge-<next>")`，所有子命令必须通过 forge 统一入口路由。
