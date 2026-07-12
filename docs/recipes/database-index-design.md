---
title: 数据库索引设计实战
---

# 数据库索引设计实战

索引设计从来不是“哪个字段常查就给哪个字段加索引”。正确顺序是：先列出查询场景，再看 where、order by、limit、数据分布和分页方式，最后设计组合索引。

## 使用场景

常见需要认真设计索引的接口：

- 订单列表：按用户、状态、时间排序分页。
- 商品后台：按类目、状态、创建时间筛选。
- 支付单查询：按业务订单号或渠道流水号查单。
- MQ outbox 扫描：按状态和下次重试时间取待发送事件。
- 消息/Feed 列表：按用户和时间游标分页。

## 设计步骤

1. 写出真实 SQL。
2. 标出等值条件、范围条件、排序字段、分页字段。
3. 判断接口 QPS 和数据量。
4. 设计组合索引。
5. 用 `EXPLAIN` 验证扫描行数和排序方式。
6. 压测或用生产采样验证。

## 推荐模板

用户订单列表：

```sql
select *
from orders
where user_id = ? and status = ?
  and created_at < ?
order by created_at desc, id desc
limit 20;
```

推荐索引：

```sql
create index idx_orders_user_status_created_id
on orders(user_id, status, created_at desc, id desc);
```

支付单按业务订单号查：

```sql
select * from payment_orders where merchant_order_id = ?;
```

推荐索引：

```sql
create unique index uk_payment_merchant_order
on payment_orders(merchant_order_id);
```

Outbox 发布器扫描：

```sql
select *
from outbox_events
where status = 'pending' and next_retry_at <= now()
order by next_retry_at asc, id asc
limit 100;
```

推荐索引：

```sql
create index idx_outbox_status_retry_id
on outbox_events(status, next_retry_at, id);
```

## 字段顺序经验

组合索引一般按这个顺序考虑：

```text
等值过滤字段 -> 范围/排序字段 -> 唯一打散字段
```

例子：

```text
where user_id = ? and status = ? order by created_at desc, id desc
索引: (user_id, status, created_at desc, id desc)
```

`id` 放最后是为了让排序稳定，也方便 cursor 分页。

## 反例

反例 1：给每个字段单独建索引。

```sql
create index idx_orders_user on orders(user_id);
create index idx_orders_status on orders(status);
create index idx_orders_created on orders(created_at);
```

问题：查询同时过滤和排序时，数据库不一定能高效组合这些索引。

修正：按真实查询建组合索引。

反例 2：范围字段放太前。

```sql
create index idx_orders_created_user on orders(created_at, user_id);
```

问题：如果查询是 `where user_id = ? order by created_at`，这个索引不适合按用户过滤。

修正：

```sql
create index idx_orders_user_created on orders(user_id, created_at desc, id desc);
```

反例 3：深分页继续用 offset。

```sql
select * from orders where user_id = ? order by created_at desc limit 20 offset 100000;
```

修正：使用 cursor：

```sql
where user_id = ?
  and (created_at < ? or (created_at = ? and id < ?))
order by created_at desc, id desc
limit 20;
```

## 常见坑与修复

| 坑 | 现象 | 修复 |
| --- | --- | --- |
| 只看字段，不看查询 | 索引很多但慢查询仍在 | 按 SQL 场景设计组合索引 |
| 排序字段没进索引 | filesort 或排序耗时高 | 把 order by 字段放入索引 |
| 分页排序不唯一 | 翻页重复或漏数据 | 使用 `created_at + id` |
| 索引过多 | 写入变慢，存储变大 | 删除未使用索引 |
| 低选择性字段单独索引 | 扫描行数仍很大 | 和高选择性字段组合 |

## 监控指标

- `db_slow_query_total{query_pattern}`
- `db_rows_scanned{query_pattern}`
- `db_query_duration_ms{query_pattern}`
- `db_lock_wait_ms{query_pattern}`
- `db_connection_pool_wait_ms{pool}`
- `db_index_unused_count{table}`

## 完整业务例子

订单列表接口需求：

- 用户只能看自己的订单。
- 可以按状态筛选。
- 按创建时间倒序展示。
- 移动端无限滚动。

SQL：

```sql
select id, status, amount, created_at
from orders
where user_id = ?
  and status = ?
  and (created_at < ? or (created_at = ? and id < ?))
order by created_at desc, id desc
limit 20;
```

索引：

```sql
create index idx_orders_user_status_created_id
on orders(user_id, status, created_at desc, id desc);
```

检查：

- `EXPLAIN` 扫描行数接近 page size。
- 没有额外 filesort。
- cursor 包含 `created_at` 和 `id`。
- 返回字段如果足够少，可以考虑覆盖索引。

## 检查清单

- 是否先列出了真实 SQL？
- where 条件和 order by 是否都考虑了？
- 是否避免深 offset？
- cursor 是否包含稳定排序字段？
- 是否用 `EXPLAIN` 验证扫描行数？
- 是否评估索引对写入的影响？
- 是否监控慢查询和扫描行数？
