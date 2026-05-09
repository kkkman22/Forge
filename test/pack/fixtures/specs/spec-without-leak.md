---
feature: check-in
status: draft
date: "2026-05-09"
context: front-desk
---

# 办理入住

## 目的

当客人到达酒店时，前台为其办理入住。

## 需求

### R1: 正常入住

当客人持有有效预订时，前台为其分配房间并办理入住。

## Scenarios

### Scenario 1: 成功入住

\`\`\`gherkin
Given 客人持有有效预订
When 前台确认客人身份
Then 系统分配物理房间并生成房卡
\`\`\`
