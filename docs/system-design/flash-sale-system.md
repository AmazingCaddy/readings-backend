---
title: 秒杀系统设计
---

# 秒杀系统设计

秒杀系统的核心是用很少的库存承接极大的瞬时请求。它不是把普通下单接口扩容十倍就能解决的问题，而是要在入口、缓存、库存、队列、订单和支付之间逐层削峰，尽早拦截无效请求。

```mermaid
flowchart LR
    U[Users] --> CDN[CDN / Static Page]
    CDN --> G[Gateway Rate Limit]
    G --> API[Seckill API]
    API --> R[(Redis Stock)]
    API --> MQ[Order Queue]
    MQ --> W[Order Worker]
    W --> DB[(Order DB)]
```

## 先理解这些概念

- **秒杀**：库存很少、流量很大、时间很集中。比如 100 件商品，10 万人同时抢。
- **削峰**：把瞬间涌入的请求挡掉一部分、排队一部分，让后端按能承受的速度处理。
- **预扣库存**：先在 Redis 里扣一个名额，说明用户拿到“创建订单资格”；真正订单稍后异步写数据库。
- **异步下单**：接口先返回“处理中”，后台 worker 从 MQ 里慢慢创建订单。
- **防刷**：拦截脚本、重复点击、异常用户，避免无效请求消耗库存服务。
- **库存对账**：活动后检查 Redis 预扣、订单库和库存流水是否一致，发现差异再修正。

读秒杀系统时要先接受一个事实：绝大多数请求不会成功。设计重点不是让每个请求都走完整下单链路，而是尽早、便宜地失败。

## 业务场景与核心挑战

活动开始瞬间，大量用户同时点击购买某个低库存商品。系统需要判断活动是否开始、用户是否有资格、库存是否还有、是否重复下单，并在高峰期保护数据库和支付链路。这里的“保护”意思是：不要让注定失败的大量请求进入数据库。

核心挑战：

- 请求量远大于库存量，大多数请求注定失败。
- 热点商品会形成 Redis 热 key 和库存写热点。
- 用户重复点击、脚本刷接口、黄牛抢购都需要防护。
- 下单链路不能同步打数据库，否则数据库会被瞬时流量击穿。
- 成功抢到资格后，还要处理支付超时和库存回补。

## 功能需求与非功能需求

功能需求：活动配置、资格校验、抢购、库存扣减、异步下单、支付、超时释放、结果查询。

非功能需求：

- 活动开始时入口不崩，失败请求快速返回。
- 库存不能超卖，允许少量排队等待结果。
- 用户不能重复抢同一活动商品。
- 活动配置和库存预热必须可靠。
- 支付超时后库存和资格可恢复。

## 核心数据模型

| 表/存储 | 关键字段 | 说明 |
| --- | --- | --- |
| `seckill_activity` | `activity_id`, `sku_id`, `start_at`, `end_at`, `limit_per_user` | 活动配置 |
| `redis_stock` | `activity_id`, `available` | Redis 预扣库存 |
| `user_purchase` | `activity_id`, `user_id`, `order_id` | 用户去重 |
| `orders` | `order_id`, `user_id`, `sku_id`, `status`, `expire_at` | 秒杀订单 |
| `stock_ledger` | `activity_id`, `order_id`, `delta` | 库存流水，便于对账 |

## 高层架构图

```mermaid
flowchart TD
    Client --> CDN
    CDN --> Gateway
    Gateway --> Risk[Risk Control]
    Risk --> SeckillAPI[Seckill API]
    SeckillAPI --> Redis[(Redis: stock + user dedupe)]
    SeckillAPI --> MQ[Order Create Queue]
    MQ --> Worker[Order Worker]
    Worker --> DB[(Order DB)]
    Worker --> Outbox[(Outbox)]
    Outbox --> EventBus[Order Events]
    EventBus --> Payment[Payment Service]
    EventBus --> Notify[Notify Service]
```

## 关键流程时序图

抢购请求只做轻量判断和 Redis 原子预扣，成功后先写入请求状态和 outbox，再由 outbox publisher 可靠进入队列异步创建订单。轻量判断包括活动时间、用户资格、风控 token、是否重复抢购。

```mermaid
sequenceDiagram
    participant U as User
    participant API as Seckill API
    participant R as Redis
    participant DB as Request DB
    participant O as Outbox
    participant MQ as MQ
    participant W as Order Worker
    participant ODB as Order DB

    U->>API: POST /seckill
    API->>API: validate time, token, risk
    API->>R: Lua check dedupe and decrement stock
    R-->>API: accepted
    API->>DB: insert request_status QUEUED
    API->>O: insert CreateOrder command
    API-->>U: processing token
    O->>MQ: publish command with producer confirm
    MQ->>W: consume command
    W->>ODB: create PendingPayment order idempotently
    W-->>U: result available by polling
```

Redis Lua 的职责是把“用户去重”和“库存扣减”放到一个原子操作里。原子操作可以理解为“中间不会被别人插队打断”，这样能避免同一个用户重复抢购，也避免库存扣成负数。

## 一致性与状态机

秒杀系统常用“Redis 预扣 + DB 最终确认”。Redis 承接瞬时并发，数据库异步落单并记录库存流水。这里的预扣不是最终结果，只是先拿到资格；最终是否成功，要看订单是否落库、用户是否支付。支付超时后释放订单占用，并根据策略回补库存或进入下一轮。

```mermaid
stateDiagram-v2
    [*] --> Accepted
    Accepted --> PendingPayment: order created
    Accepted --> Failed: worker validation failed
    PendingPayment --> Paid: payment success
    PendingPayment --> Cancelled: payment timeout
    Cancelled --> StockReturned
    Paid --> [*]
    StockReturned --> [*]
```

## 高并发瓶颈分析

- **入口流量**：活动开始瞬间请求量可能超过正常峰值百倍，需要 CDN、网关限流和排队页。
- **库存 key**：单商品库存是天然热 key，Lua 操作要短，必要时做库存分片。
- **重复请求**：同一用户重复点击会放大流量，必须在 Redis 里快速去重。
- **订单队列**：消费者能力决定最终落单速度，队列积压要可观测。
- **结果查询**：用户轮询抢购结果也会形成读峰值，需要短 TTL 缓存。

## 缓存、MQ、数据库的使用方式

- CDN 承接静态活动页和活动配置，减少源站请求。
- Redis 保存活动状态、库存、用户去重和抢购结果。
- MQ 用来削峰，把抢购成功资格先排队，再由后台 worker 按数据库能承受的速度转为订单。
- 数据库保存最终订单、库存流水和支付状态。最终正确性以数据库和库存流水为准。
- Outbox 发布订单创建、支付成功、取消等事件，避免订单状态变化了但消息丢失。

## 失败场景与补偿

- Redis 预扣成功但 outbox 写入失败：本次请求不能返回已接收，需要回补 Redis 库存并标记失败。
- Outbox 写入成功但 MQ 发送失败：publisher 重试；如果长期失败，由扫描任务告警并继续发布，不要让请求静默卡死。
- Worker 创建订单失败：记录失败原因，回补库存并清理用户占用。
- 支付超时：关单任务条件更新订单状态，释放库存或进入候补池。
- Redis 库存和 DB 不一致：活动结束后按库存流水对账，必要时人工修正。
- MQ 积压过高：入口降级为排队中或直接售罄，保护订单库。

## 扩展方案与取舍

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| Redis 原子预扣 | 吞吐高，DB 压力小 | 需要对账和补偿 |
| 库存分片 | 降低单 key 热点 | 结束时聚合和回补更复杂 |
| 队列异步下单 | 削峰明显 | 用户需要查询结果 |
| 静态化活动页 | 源站压力低 | 配置更新需要发布机制 |
| 风控前置 | 减少无效流量 | 误杀需要兜底申诉 |

## 面试版总结

秒杀系统要尽早过滤请求。静态页走 CDN，网关做限流和防刷，服务端校验活动 token 和用户资格。库存放 Redis，用 Lua 原子完成去重和预扣，成功请求进入 MQ，后台 worker 异步创建待支付订单。数据库只承接少量成功请求，支付超时后关单释放库存。全链路要有结果查询、队列积压监控、库存对账和补偿任务。可以把它理解成：入口挡流量，Redis 抢资格，MQ 排队，数据库做最终确认。

## 深挖：从面试题到真实设计

### 业务边界和澄清问题

面试时不要一上来画 Redis 和 MQ。先把业务边界问清楚：

| 问题 | 为什么要问 | 对设计的影响 |
| --- | --- | --- |
| 是一人一单，还是一人可以买多件？ | 决定唯一约束 | `user_id + activity_id` 或允许多订单 |
| 库存是单商品，还是多 SKU？ | 决定库存 key 和扣减粒度 | 单 key、分片 key 或 SKU 维度库存 |
| 成功标准是抢到资格，还是支付完成？ | 决定状态机 | `Accepted` 不等于最终成交 |
| 是否允许候补或回流库存？ | 决定取消后的处理 | 直接回补、候补队列或结束后退款 |
| 活动是否需要公平排队？ | 决定入口策略 | 直接抢、排队页、令牌发放 |

一个合理的面试边界可以这样设定：只做单活动、单商品、每人最多一单、库存有限、下单后 15 分钟支付，超时释放资格，不做复杂优惠和物流。

### 容量估算

容量估算的作用不是追求精确，而是说明为什么要用缓存、限流和队列。

假设：

```text
活动库存：10,000 件
预约用户：5,000,000
开抢前 10 秒到达：1,000,000 请求
入口峰值 QPS：100,000
真实可成功请求：10,000
订单库可稳定写入：2,000 TPS
```

推导：

- 如果所有请求都查数据库，数据库会被 100,000 QPS 打垮。
- Redis 只需要筛出约 10,000 个成功资格，失败请求在缓存层返回。
- MQ 需要吸收 10,000 条创建订单命令；如果 worker 每秒创建 2,000 单，约 5 秒可消化。
- 结果查询可能比下单请求更久，用户会反复刷新，所以 `result:{activity_id}:{user_id}` 要缓存。

### 具体数据模型和 Key

数据库最终表：

```sql
create table flash_sale_orders (
  order_id varchar(64) primary key,
  activity_id varchar(64) not null,
  user_id varchar(64) not null,
  sku_id varchar(64) not null,
  quantity int not null,
  status varchar(32) not null,
  created_at timestamp not null,
  updated_at timestamp not null,
  unique (activity_id, user_id)
);

create table stock_deductions (
  deduction_id varchar(64) primary key,
  activity_id varchar(64) not null,
  sku_id varchar(64) not null,
  order_id varchar(64) not null,
  quantity int not null,
  type varchar(32) not null,
  created_at timestamp not null
);
```

Redis Key：

```text
fs:stock:{activity_id}:{sku_id} -> available stock
fs:user:{activity_id}:{user_id} -> PROCESSING / ORDERED / SOLD_OUT
fs:result:{activity_id}:{user_id} -> order_id or failure reason
fs:rate:user:{user_id}:{second} -> request count
fs:rate:activity:{activity_id}:{second} -> request count
fs:token:{activity_id}:{user_id} -> pre-issued access token
```

MQ Topic：

```text
flashsale.order.create
key = activity_id + ':' + user_id
payload = {activity_id, user_id, sku_id, quantity, request_id}
```

`key` 里带 `activity_id + user_id`，可以让同一个用户同一活动的消息进入同一分区，方便去重和顺序处理。

### 并发冲突流程

同一个用户重复点击时，Redis Lua 要一次性完成“是否抢过”和“是否还有库存”的判断。

```mermaid
sequenceDiagram
    participant U as User
    participant API as FlashSale API
    participant R as Redis Lua
    participant MQ as MQ

    U->>API: click buy twice
    API->>R: check user marker and decr stock
    API->>R: check user marker and decr stock
    R-->>API: first request OK
    R-->>API: second request DUPLICATE
    API->>MQ: publish only one CreateOrder
```

核心原则：重复请求不能进入 MQ，更不能进入数据库。Redis 去重只是第一层，数据库 `unique (activity_id, user_id)` 是最后防线。

### 失败补偿流程

最容易被追问的是“Redis 扣了库存，但后面失败怎么办”。可以按下面讲：

```mermaid
flowchart TD
    A[Redis stock deducted] --> B{MQ publish success?}
    B -->|no| C[restore Redis stock]
    B -->|yes| D[Worker creates order]
    D --> E{DB transaction success?}
    E -->|yes| F[mark result ORDERED]
    E -->|no retryable| G[retry message]
    E -->|no final failure| H[restore stock and mark FAILED]
```

补偿要记录原因和幂等键，不能只简单 `INCR stock`。否则重复补偿可能把库存加多。更稳的做法是写库存流水，按流水对账。

### 演进路线

| 规模 | 设计 |
| --- | --- |
| 1,000 QPS | 应用限流 + DB 条件更新，可能不需要 MQ |
| 10,000 QPS | Redis 原子预扣 + MQ 异步落单 + DB 唯一约束 |
| 100,000 QPS | CDN 静态化、排队页、活动 token、库存分片、结果缓存 |
| 更大规模 | 分活动分集群、热点活动隔离、预发令牌、风控前置、容量预案 |

### 10 分钟面试表达

可以按这个顺序讲：

1. 先澄清边界：单活动、单 SKU、每人一单、下单后支付。
2. 做容量估算：入口 10 万 QPS，但库存只有 1 万，数据库不能承接全部请求。
3. 入口保护：CDN、网关限流、防刷、活动 token。
4. 核心链路：Redis Lua 原子去重和扣库存，成功后进 MQ。
5. 落库链路：worker 创建订单，数据库唯一约束防重复，库存流水用于对账。
6. 状态和查询：API 返回处理中，用户查结果缓存，最终看订单状态。
7. 失败补偿：MQ 失败、worker 失败、支付超时都要回补或标记失败。
8. 观测：入口 QPS、Redis 错误率、库存剩余、MQ lag、订单创建成功率、补偿失败数。

## 术语回看

- [削峰](./glossary.md#削峰)
- [预扣库存](./glossary.md#预扣库存)
- [热点 / 热 Key](./glossary.md#热点--热-key)
- [幂等](./glossary.md#幂等)
- [对账](./glossary.md#对账)

## 工程检查清单

- 活动配置、库存和页面是否提前预热？
- 入口是否有限流、防刷和排队策略？
- Redis 扣库存和用户去重是否原子？
- 是否避免所有请求直接打数据库？
- 抢购结果查询是否有缓存保护？
- MQ 积压、Redis 错误率、订单创建失败率是否有告警？
- 库存回补和活动后对账是否有流程？

## 延伸阅读

- [Redis: EVAL command](https://redis.io/docs/latest/commands/eval/)
- [Google SRE Book: Handling Overload](https://sre.google/sre-book/handling-overload/)
- [AWS Builders Library: Avoiding insurmountable queue backlogs](https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/)
- [Microservices.io: Saga](https://microservices.io/patterns/data/saga.html)
