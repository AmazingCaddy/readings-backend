---
title: MQ Topic 与 Message Key 设计实战
---

# MQ Topic 与 Message Key 设计实战

MQ 设计最容易出问题的地方不是“会不会发消息”，而是 topic 太乱、消息语义不清、key 选错导致乱序、payload 无版本导致消费者升级困难。

## 使用场景

常见 MQ 消息：

- 订单创建：通知库存、通知、搜索、分析。
- 支付成功：通知订单服务推进状态。
- 库存变更：同步搜索索引或缓存。
- 用户注册：发送欢迎短信、初始化资料。
- 商品变更：刷新缓存、重建索引。

## 命名规范

Topic 推荐按业务域命名：

```text
{domain}-events
{domain}-commands
{domain}-retry
{domain}-dlq
```

事件类型使用过去式：

```text
OrderCreated
PaymentSucceeded
InventoryReserved
ProductUpdated
```

命令使用祈使语义：

```text
ReserveInventory
SendNotification
RebuildSearchIndex
```

## 推荐模板

订单事件 topic：

```text
order-events
```

支付事件 topic：

```text
payment-events
```

商品事件 topic：

```text
product-events
```

重试 topic：

```text
order-events.retry.1m
order-events.retry.10m
order-events.dlq
```

## Message Key 设计

Message key 决定分区，也经常决定局部顺序。

推荐：

| 场景 | Message Key |
| --- | --- |
| 订单事件 | `order_id` |
| 支付事件 | `payment_id` 或 `merchant_order_id` |
| 商品事件 | `product_id` |
| 用户事件 | `user_id` |
| 库存事件 | `sku_id` |

如果同一订单的事件需要按顺序处理，就用同一个 `order_id` 做 key，让它们进入同一分区。

## Payload 模板

事件消息建议包含这些字段：

```json
{
  "event_id": "evt_123",
  "event_type": "OrderCreated",
  "schema_version": 1,
  "occurred_at": "2026-07-12T10:00:00Z",
  "producer": "order-service",
  "aggregate_type": "order",
  "aggregate_id": "order_1001",
  "trace_id": "trace_abc",
  "payload": {
    "order_id": "order_1001",
    "user_id": "user_1",
    "amount": 19900
  }
}
```

字段说明：

- `event_id`：消费者幂等去重。
- `event_type`：消费者判断业务语义。
- `schema_version`：兼容演进。
- `aggregate_id`：同一业务对象的 ID。
- `trace_id`：排查链路。

## 反例

反例 1：所有消息放一个 topic。

```text
events
```

问题：权限、保留周期、消费组、重试策略都难管理。

修正：按业务域拆分。

```text
order-events
payment-events
product-events
```

反例 2：message key 用随机 UUID。

问题：同一订单事件进入不同分区，消费者看到乱序。

修正：

```text
key = order_id
```

反例 3：payload 没有版本。

问题：生产者加字段或改字段后，旧消费者解析失败。

修正：加 `schema_version`，并保持向后兼容。

## 常见坑与修复

| 坑 | 现象 | 修复 |
| --- | --- | --- |
| topic 太粗 | 消费者订阅无关消息 | 按业务域拆分 topic |
| key 选错 | 同一业务对象乱序 | 用 aggregate_id 做 key |
| 没有 event_id | 消费者无法幂等 | 每条事件全局唯一 ID |
| payload 无版本 | schema 演进困难 | 加 `schema_version` |
| 消息放完整大对象 | 消息过大且泄露字段 | 只放必要字段和 ID |

## 监控指标

- `mq_produce_total{topic,event_type}`
- `mq_consume_total{topic,consumer_group,result}`
- `mq_consumer_lag{topic,consumer_group}`
- `mq_dlq_total{topic,event_type}`
- `mq_message_size_bytes{topic}`
- `mq_duplicate_event_total{event_type}`

## 完整业务例子

订单创建事件：

```text
topic: order-events
key: order_1001
event_type: OrderCreated
event_id: evt_202607120001
```

库存服务消费：

1. 用 `event_id` 写 `processed_events` 去重。
2. 根据 `order_id` 预占库存。
3. 成功后提交事务并 ack。
4. 临时失败进入 retry topic。
5. 多次失败进入 `order-events.dlq`。

## 检查清单

- topic 是否按业务域拆分？
- 事件和命令是否分清？
- event type 是否表达清楚业务语义？
- message key 是否保证需要的局部顺序？
- payload 是否有 `event_id` 和 `schema_version`？
- 消费者是否能用 event_id 幂等？
- 是否设计 retry topic 和 DLQ？
