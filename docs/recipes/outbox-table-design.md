---
title: Outbox 表设计实战
---

# Outbox 表设计实战

Outbox 表的目标是把“业务状态变化”和“待发送消息”放进同一个本地事务。这样数据库提交成功后，消息不会因为进程崩溃或 MQ 短暂不可用而丢失。

## 使用场景

适合使用 Outbox 的场景：

- 订单创建后发布 `OrderCreated`。
- 支付成功后发布 `PaymentSucceeded`。
- 退款成功后发布 `RefundSucceeded`。
- 商品价格变更后发布 `ProductUpdated`。
- 库存变化后同步搜索或缓存。

## 表结构模板

```sql
create table outbox_events (
  id varchar(64) primary key,
  aggregate_type varchar(64) not null,
  aggregate_id varchar(64) not null,
  event_type varchar(128) not null,
  schema_version int not null,
  payload json not null,
  status varchar(32) not null,
  retry_count int not null default 0,
  next_retry_at timestamp not null,
  locked_by varchar(64),
  locked_until timestamp,
  published_at timestamp,
  created_at timestamp not null,
  updated_at timestamp not null
);
```

推荐索引：

```sql
create index idx_outbox_status_retry_id
on outbox_events(status, next_retry_at, id);

create index idx_outbox_aggregate
on outbox_events(aggregate_type, aggregate_id, created_at);
```

## 字段说明

| 字段 | 作用 |
| --- | --- |
| `id` | 事件 ID，消费者幂等 key |
| `aggregate_type` | 业务对象类型，例如 `order` |
| `aggregate_id` | 业务对象 ID，例如订单 ID |
| `event_type` | 事件类型，例如 `OrderCreated` |
| `schema_version` | payload 版本 |
| `payload` | 消息内容 |
| `status` | `pending`、`publishing`、`published`、`failed` |
| `retry_count` | 重试次数 |
| `next_retry_at` | 下次可发布的时间 |
| `locked_by` | 发布器实例 ID |
| `locked_until` | 锁租约过期时间 |

## 写入模板

订单创建事务：

```sql
begin;

insert into orders(id, user_id, status, amount)
values (?, ?, 'PENDING_PAYMENT', ?);

insert into outbox_events(
  id, aggregate_type, aggregate_id, event_type,
  schema_version, payload, status, next_retry_at,
  created_at, updated_at
) values (
  ?, 'order', ?, 'OrderCreated',
  1, ?, 'pending', now(), now(), now()
);

commit;
```

## 发布器扫描模板

PostgreSQL / MySQL 8 可以使用 `skip locked` 思路：

```sql
begin;

select *
from outbox_events
where status = 'pending'
  and next_retry_at <= now()
order by next_retry_at asc, id asc
limit 100
for update skip locked;

update outbox_events
set status = 'publishing', locked_by = ?, locked_until = now() + interval '2 minutes'
where id in (...selected ids...);

commit;
```

这一步只负责短事务 claim，不要在持有数据库行锁时调用 MQ。发布器提交事务后再逐条发送 MQ，发送完成后回写结果。

发送成功：

```sql
update outbox_events
set status = 'published', published_at = now(), updated_at = now()
where id = ? and status = 'publishing';
```

发送失败：

```sql
update outbox_events
set retry_count = retry_count + 1,
    next_retry_at = ?,
    status = 'pending',
    updated_at = now()
where id = ? and status = 'publishing';
```

还需要一个恢复任务把超时的 `publishing` 行改回 `pending`。否则发布器 claim 后宕机，这批事件会一直卡在 `publishing`。

## 反例

反例 1：业务提交后直接发 MQ，不落 outbox。

问题：数据库成功但 MQ 发送失败，事件丢失。

修正：同一事务写业务表和 outbox 表。

反例 2：先标记 published 再发 MQ。

问题：标记成功后进程崩溃，消息永远不会发。

修正：先发送 MQ，成功后再标记 published。重复发送靠消费者幂等解决。

反例 3：outbox 表不清理。

问题：表越来越大，扫描变慢。

修正：已发布事件按时间归档或删除。

## 常见坑与修复

| 坑 | 现象 | 修复 |
| --- | --- | --- |
| 没有合适索引 | 发布器扫描慢 | 建 `(status, next_retry_at, id)` |
| 多发布器重复抢 | 同一事件并发发送 | 使用 `skip locked` 或租约字段 |
| 消费者不幂等 | 重复发布导致重复业务 | event_id 去重 |
| payload 无版本 | 消费者升级困难 | 加 `schema_version` |
| 没有 DLQ | 坏事件无限重试 | 最大重试后标记 failed |

## 监控指标

- `outbox_pending_total{event_type}`
- `outbox_oldest_pending_age_seconds{event_type}`
- `outbox_publish_total{event_type,result}`
- `outbox_retry_total{event_type}`
- `outbox_failed_total{event_type}`
- `outbox_publisher_lag_seconds`

## 完整业务例子

支付成功：

1. 支付回调验签成功。
2. 本地事务把支付单从 `PAYING` 改成 `SUCCEEDED`。
3. 同一事务写 `PaymentSucceeded` outbox 事件。
4. 发布器发送到 `payment-events`。
5. 订单服务消费事件，用 `event_id` 去重。
6. 订单服务把订单从 `PENDING_PAYMENT` 改成 `PAID`。

## 检查清单

- 业务表和 outbox 表是否同事务写入？
- outbox 是否有 `event_id`、`event_type`、`schema_version`？
- 发布器扫描是否有合适索引？
- 多发布器是否会重复抢同一事件？
- 发送成功后才标记 published 吗？
- 消费者是否用 event_id 幂等？
- 是否有堆积告警、失败告警和归档策略？
