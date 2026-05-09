---
feature: reservation-creation
status: draft
date: "2026-05-09"
context: reservations
---

# 创建预订

## 目的

当客人发起预订请求时，系统应创建一条预订记录并发送确认。

## 需求

### R1: 基本预订创建

当客人提供入住日期、离店日期和房型时，系统创建预订记录。

## Scenarios

### Scenario 1: 成功创建预订

\`\`\`gherkin
Given 客人选择了标准间
When 客人提交预订请求
Then 系统创建预订并发送确认邮件
\`\`\`

### Scenario 2: 实现细节泄露

系统通过 UserService 获取用户信息，然后调用 ReservationController 创建预订。
数据库中 SELECT * FROM reservations WHERE id = ? 查询预订。
使用 Redis 缓存结果，Kafka 发送异步消息。
