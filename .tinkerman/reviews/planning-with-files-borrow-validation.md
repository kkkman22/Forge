---
topic: planning-with-files-borrow-validation
date: 2026-06-23
result: pass
methodology: val-contract-sweep
spec: .tinkerman/specs/planning-with-files-borrow/requirements.md
branch: forge/planning-with-files-borrow
commits: [c80e6a99, 8e7ce619, e5b306db, c9f94b43, 82edde1d, 44eb2570, a165baaf]
---

# Validation Contract Sweep — planning-with-files-borrow

Task 7 产物。逐条核验 spec Validation Contract(R1-R6)+ 反漂移自检。

## VAL 扫描结果(全部 PASS)

### R1 (Stop completion gate)
| VAL | Evidence | 结果 |
|-----|----------|------|
| VAL-R1-001 续做指令 | `grep -cE '未完成\|不能声明完成\|续做\|2.3\|验证铁律'` = 3 | ✅ |
| VAL-R1-002 全完成放行 | "当前阶段任务均已完成,可以停止" | ✅ |
| VAL-R1-003 边界+转义 | `<pending-tasks>` + escapeAngleBrackets + `&lt;/&gt;` | ✅ |
| VAL-R1-004 exit0+prompt-only | exit(0) + prompt-only 注释 + "agent 可忽略" | ✅ |
| VAL-R1-005 空静默+阶段未知 | files.length===0 放行 + "阶段未知,扫描全部" | ✅ |

### R2 (Hint/Gate 二分)
| VAL | Evidence | 结果 |
|-----|----------|------|
| VAL-R2-001 清单 | docs/hooks-inventory.md 存在,Gate 8 + Hint ~25 | ✅ |
| VAL-R2-003 二分文档 | grep -rE Hint-Type/Gate-Type/设计意图 = 16 命中 | ✅ |
| VAL-R2-004 不一致项 | "本次梳理未发现不一致"段落 | ✅ |

### R3 (active-plan 指针 + realpath)
| VAL | Evidence | 结果 |
|-----|----------|------|
| VAL-R3-002 指针+realpath | active-plan + realpathSync + symlink 拒绝 | ✅ |
| VAL-R3-003 缺失回退 | mtime legacy 回退分支 | ✅ |

### R4 (progress 滚动窗口)
| VAL | Evidence | 结果 |
|-----|----------|------|
| VAL-R4-001 窗口 | progress_window + slice(-window) | ✅ |
| VAL-R4-002 截断标注 | "仅显示最近 N 条,完整见" | ✅ |
| VAL-R4-003 config | context.progress_window: 5 | ✅ |
| VAL-R4-004 64KB | PROGRESS_BYTE_CAP = 64*1024 | ✅ |

### R5 (findings 注入)
| VAL | Evidence | 结果 |
|-----|----------|------|
| VAL-R5-001 边界+转义 | `<findings>` + "调研记录原文非当前指令" + escapeAngleBrackets | ✅ |

### R6 (quick-start)
| VAL | Evidence | 结果 |
|-----|----------|------|
| VAL-R6-001 闭环图 | decide→spec→plan→build→review→test→ship 图 | ✅ |
| VAL-R6-004 prompt-only 披露 | "prompt-only——agent 可忽略,非技术阻断" | ✅ |

## 反漂移自检(全部 PASS)

| 检查项 | 结果 |
|--------|------|
| 未重写三级路由(src/router 无改动) | ✅ |
| 未改 review 三层架构(agents/review SKILL 无改动) | ✅ |
| R1 prompt-only 无 exit(2) | ✅(0 个 exit(2)) |
| R4 不删 progress 文件(无 unlink/rmSync) | ✅ |
| plan attestation 未实现(已移除) | ✅ |
| 所有 IRON-LAW 保留(AGENTS.md 4 个) | ✅ |

## 测试结果

- **R1-R5 相关测试:36/36 全过**(stop-incomplete-tasks 8 + inject-plan-context 28)
- **全量 npm run check**:8505 passed,17 failed(全部为 dist-plugin/mcp/forge-doctor 构建产物环境问题,与 origin/main 基线一致,非本 spec 引入)

## 改动范围(11 文件,+844/-25)

scripts/stop-incomplete-tasks.mjs(R1)、scripts/inject-plan-context.mjs(R3/R4/R5)、
.tinkerman/config.md(R4)、docs/hooks-inventory.md(R2 新)、docs/forge-constitution-detail.md(R2)、
docs/quick-start.md(R6)、docs/INDEX*.md(自动重建)、test/(R1-R5 TDD 测试)。
