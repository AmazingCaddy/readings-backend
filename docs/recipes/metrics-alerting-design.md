---
title: 监控指标与告警设计实战
---

# 监控指标与告警设计实战

监控不是把所有数字都上报，告警也不是所有异常都叫醒人。好的指标能定位问题，好的告警能让人只在需要行动时被打扰。

## 使用场景

需要重点设计指标和告警的对象：

- 核心 API：下单、支付、登录、查询订单。
- 数据库：慢查询、连接池等待、锁等待。
- Redis：命中率、热点 key、延迟、错误率。
- MQ：积压、消费失败、DLQ。
- Outbox：待发布事件、最老 pending 年龄。
- 业务状态：待支付订单超时、卡状态订单、退款失败。

## 指标命名规范

推荐格式：

```text
{domain}_{object}_{measure}_{unit}
```

例子：

```text
http_server_requests_total
http_server_request_duration_ms
db_query_duration_ms
redis_cache_hit_total
mq_consumer_lag_messages
outbox_pending_events_total
order_state_transition_total
```

规则：

- counter 用 `_total` 结尾。
- duration 明确单位，例如 `_ms` 或 `_seconds`。
- 不在指标名里放动态值，动态维度放 label。
- label 控制基数，不能放 `user_id`、`order_id`。

## 推荐指标模板

API RED 指标：

```text
http_server_requests_total{route,method,status}
http_server_request_duration_ms{route,method}
http_server_errors_total{route,error_type}
```

数据库：

```text
db_query_duration_ms{query_pattern}
db_connection_pool_wait_ms{pool}
db_slow_query_total{query_pattern}
db_lock_wait_ms{table}
```

Redis 缓存：

```text
redis_cache_hit_total{key_type}
redis_cache_miss_total{key_type}
redis_command_duration_ms{command}
redis_hot_key_qps{key_pattern}
```

MQ：

```text
mq_consume_total{topic,consumer_group,result}
mq_consumer_lag_messages{topic,consumer_group}
mq_dlq_total{topic,event_type}
```

Outbox：

```text
outbox_pending_events_total{event_type}
outbox_oldest_pending_age_seconds{event_type}
outbox_publish_total{event_type,result}
```

## Label 设计

推荐 label：

```text
route, method, status, service, dependency, topic, consumer_group, event_type, key_type
```

避免 label：

```text
user_id, order_id, request_id, trace_id, raw_url, phone, email
```

原因：这些字段取值太多，会让指标系统基数爆炸，查询变慢，存储成本升高。

## 告警模板

核心 API 错误率：

```text
条件: 5 分钟内 order create 5xx rate > 2%
动作: page
说明: 核心下单链路用户受影响
```

P99 延迟：

```text
条件: order create P99 > 800ms 持续 10 分钟
动作: page 或高优先级 ticket
说明: 用户体验明显变差
```

MQ 积压：

```text
条件: payment-events consumer lag > 100000 或最老消息 > 5 分钟
动作: page
说明: 支付结果可能无法及时推进订单
```

Outbox 堆积：

```text
条件: outbox oldest pending age > 3 分钟
动作: page
说明: 业务事件可能没有发出
```

## 反例

反例 1：用 CPU 高直接 page。

问题：CPU 高不一定影响用户，容易制造噪声。

修正：CPU 进 dashboard；用户成功率、P99、错误预算燃烧才 page。

反例 2：指标 label 放 `order_id`。

问题：指标基数爆炸。

修正：`order_id` 放日志和 trace，不放指标 label。

反例 3：只监控平均延迟。

问题：少数用户很慢但平均值正常。

修正：监控 P95/P99 和 histogram。

## 常见坑与修复

| 坑 | 现象 | 修复 |
| --- | --- | --- |
| 告警太多 | 值班疲劳 | 只 page 用户影响和快速燃烧预算 |
| 没有 runbook | 收到告警不知道怎么办 | 告警附 dashboard 和处理步骤 |
| 指标无业务维度 | 不知道哪个接口坏了 | 加 `route`、`event_type` 等低基数 label |
| 没有业务指标 | 技术指标正常但用户投诉 | 加订单成功率、支付成功率 |
| 修复后不验证 | 不知道是否恢复 | 用指标确认 P99、错误率回落 |

## 完整业务例子

订单创建接口仪表盘：

必须展示：

- QPS：`http_server_requests_total{route="/orders"}`
- 错误率：5xx / total
- 延迟：P50/P95/P99
- 数据库连接池等待
- Redis 库存扣减延迟和失败率
- MQ 入队成功率
- 订单创建成功率
- 限流命中数

告警：

```text
Page:
- 订单创建成功率 < 99% 持续 5 分钟
- 订单创建 P99 > 1s 持续 10 分钟
- MQ 入队失败率 > 1% 持续 5 分钟

Ticket:
- P99 > 800ms 持续 30 分钟
- 限流命中数较昨日同时间增加 3 倍
```

## 检查清单

- 指标名是否包含单位？
- counter 是否以 `_total` 结尾？
- label 是否避免高基数字段？
- 是否有 QPS、错误率、P99？
- 是否有业务成功率？
- 告警是否对应明确用户影响？
- 每个 page 告警是否有 runbook？
- 修复后是否能用指标验证恢复？
