---
title: 火车票购票系统设计
---

# 火车票购票系统设计

火车票购票系统的核心压力点是“读请求极高、库存强约束、订单状态复杂”。它不像微博 Feed 可以接受较宽松的最终一致：同一座位不能卖给两个人，余票展示可以短暂不准，但支付成功后的出票结果必须正确。

```mermaid
flowchart LR
    U[User] --> Q[Query Service]
    U --> O[Order Service]
    Q --> C[(Redis Availability Cache)]
    Q --> DB[(Train Inventory DB)]
    O --> L[Inventory Lock/Reserve]
    O --> P[Payment]
    O --> MQ[Order Events]
```

## 先理解这些概念

- **余票查询**：用户看到“还有几张票”。这个数字可以短暂不准，因为真正能不能买到要以下单占座为准。
- **占座**：用户提交订单后，系统先临时锁住一个座位或一份库存，给用户一段支付时间。
- **区间库存**：火车票不是简单的“商品库存”。A-B-C-D 四站中，买 A 到 D 会占用 AB、BC、CD 三段；买 B 到 C 只占用 BC 一段。
- **强一致**：同一座位不能同时卖给两个人。查询页可以不准，但最终出票必须正确。
- **支付超时释放**：用户占座后不支付，系统要把占用释放回库存。
- **候补**：当前没票时，用户排队等待别人退票或超时释放后自动补上。

读这篇时可以抓住一条主线：查询可以靠缓存扛流量，但下单占座必须回到权威库存做原子校验。

## 业务场景与核心挑战

用户按出发地、目的地、日期查询车次，选择席别后提交订单，系统需要占座，用户在限定时间内支付。支付成功后出票，超时未支付释放座位。热门线路在开票瞬间会出现极高并发。

核心挑战：

- 查询流量远高于下单流量，余票缓存必须能扛住读峰值。
- 座位库存不能超卖，尤其是同一车次、区间、席别。
- 火车票是区间库存，不只是简单商品库存。
- 支付超时、取消、失败回调都要释放占座。
- 候补、改签、退票会重新影响库存和订单状态。

## 功能需求与非功能需求

功能需求：车次查询、余票查询、提交订单、占座、支付、出票、取消、退票、候补。

非功能需求：

- 查询接口高可用，允许秒级缓存延迟。
- 下单接口必须防止超卖和重复占座。
- 支付回调必须幂等处理。
- 未支付订单按时释放库存。
- 高峰期能限流和排队，保护库存服务。

## 核心数据模型

| 表/存储 | 关键字段 | 说明 |
| --- | --- | --- |
| `trains` | `train_id`, `date`, `stations` | 车次基础信息 |
| `seat_inventory` | `train_id`, `date`, `seat_type`, `segment`, `available` | 区间余票库存 |
| `seat_locks` | `lock_id`, `order_id`, `seat_id`, `expires_at` | 临时占座 |
| `orders` | `order_id`, `user_id`, `status`, `amount`, `expire_at` | 订单状态 |
| `tickets` | `ticket_id`, `order_id`, `passenger_id`, `seat_id` | 已出票记录 |
| `waitlist` | `request_id`, `route`, `seat_type`, `status` | 候补请求 |

区间库存可以把车站序列映射为多个 segment，也就是相邻两站之间的一小段。例如 A-B-C-D 中，A 到 D 会占用 AB、BC、CD 三段；B 到 C 只占用 BC 一段。判断能否卖票时，要确认用户要经过的每一段都有余量。

```mermaid
flowchart LR
    A[A站] --> AB[AB段]
    AB --> B[B站]
    B --> BC[BC段]
    BC --> C[C站]
    C --> CD[CD段]
    CD --> D[D站]
```

## 高层架构图

```mermaid
flowchart TD
    Client --> Gateway
    Gateway --> Query[Ticket Query API]
    Gateway --> Order[Order API]
    Query --> Redis[(Redis Availability Cache)]
    Query --> InvRead[(Inventory Read DB)]
    Order --> Limiter[Rate Limit and Queue]
    Limiter --> Inv[Inventory Service]
    Inv --> InvDB[(Inventory DB)]
    Order --> OrderDB[(Order DB)]
    Order --> Outbox[(Outbox)]
    Outbox --> MQ[Order Events]
    MQ --> Expire[Expire Worker]
    MQ --> Notify[Notify Service]
```

## 关键流程时序图

提交订单要先通过限流，再在库存服务中原子占座，最后创建待支付订单。这里的“原子”意思是：要么所有相关区间都占成功，要么全部失败，不能只占了一半。

```mermaid
sequenceDiagram
    participant U as User
    participant O as Order API
    participant I as Inventory Service
    participant DB as Inventory DB
    participant ODB as Order DB
    participant MQ as MQ

    U->>O: submit order with idempotency key
    O->>I: reserve seat segments
    I->>DB: conditional decrement or lock seat
    DB-->>I: reserved
    I-->>O: seat lock id
    O->>ODB: create PendingPayment order
    O->>MQ: emit OrderCreated by outbox
    O-->>U: pay before expire_at
```

支付超时释放库存：

```mermaid
sequenceDiagram
    participant T as Expire Worker
    participant ODB as Order DB
    participant I as Inventory Service
    participant MQ as MQ

    T->>ODB: scan expired PendingPayment orders
    T->>ODB: update PendingPayment -> Cancelled
    T->>I: release seat lock
    I-->>T: released idempotently
    T->>MQ: emit OrderCancelled
```

## 一致性与状态机

订单状态机是购票系统的主线。库存和支付都围绕状态流转做幂等。

```mermaid
stateDiagram-v2
    [*] --> PendingPayment
    PendingPayment --> Paid: payment success
    PendingPayment --> Cancelled: timeout or user cancel
    Paid --> Ticketed: issue ticket
    Paid --> RefundPending: refund requested
    Ticketed --> RefundPending: refund requested
    RefundPending --> Refunded
    Cancelled --> [*]
    Refunded --> [*]
```

库存一致性通常由数据库条件更新或座位锁表保证：同一个座位或同一段库存只能被一个有效订单占用。支付回调只允许 `PendingPayment -> Paid`，重复回调返回已处理结果。这里的条件更新和订单文章里的状态机是同一类思想：只有当前状态符合预期，才允许推进。

## 高并发瓶颈分析

- **余票查询**：同一热门线路会形成缓存热点，需要按车次、日期、席别缓存。
- **库存扣减**：同一车次席别是写热点，必须限制进入库存服务的并发。
- **区间库存**：跨多个 segment 的原子扣减比普通商品库存复杂。
- **订单创建**：用户重复提交需要幂等键，避免重复占座。
- **超时释放**：大量未支付订单同时过期，会形成释放流量尖峰。

## 缓存、MQ、数据库的使用方式

- Redis 缓存余票快照，用短 TTL 和主动刷新承接查询峰值。
- 数据库保存库存权威状态。权威状态意思是：最终判断有没有票，以数据库中的库存或座位锁为准，而不是以缓存展示为准。
- 扣减库存使用事务和条件更新，避免并发下把同一段库存卖成负数。
- MQ 用于订单创建、支付成功、超时关单、候补唤醒和通知。它的作用是把慢操作异步化，不阻塞用户请求。
- Outbox 保证订单状态变化后事件不丢，比如订单取消后释放库存的事件不能丢。
- 本地缓存可以缓存车次基础信息和站点映射，减少数据库查询。

## 失败场景与补偿

- 占座成功但创建订单失败：释放 seat lock，或由补偿任务扫描孤儿锁。
- 支付成功但回调延迟：订单查询主动向支付渠道查单并补偿状态。
- 关单任务失败：按 `expire_at` 周期性扫描，条件更新保证幂等。
- 余票缓存不准：下单以库存数据库为准，查询页提示“余票可能变化”。
- 候补唤醒失败：候补请求保留状态，由 worker 重试。

## 扩展方案与取舍

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| 余票缓存 | 查询快，保护数据库 | 可能短暂不准 |
| 请求排队 | 保护库存服务 | 用户等待增加 |
| 座位级锁定 | 精确防重 | 实现复杂，写压力高 |
| 席别库存扣减 | 吞吐高 | 选座能力弱 |
| 候补队列 | 提升转化 | 状态和公平性复杂 |

## 面试版总结

火车票系统要把查询和下单分开。查询走缓存和读库，允许短暂不准；下单必须进入库存服务，通过限流和队列保护写热点。库存扣减以数据库事务或座位锁为准，因为同一座位不能卖给两个人。订单状态从待支付到已支付、已出票、取消或退款。支付回调和关单任务都要幂等。余票变化、订单超时和候补唤醒通过 MQ 异步处理，Outbox 保证事件可靠发布。

## 术语回看

- [最终一致性](./glossary.md#最终一致性)
- [幂等](./glossary.md#幂等)
- [补偿](./glossary.md#补偿)
- [状态机](./glossary.md#状态机)
- [读写分离](./glossary.md#读写分离)

## 工程检查清单

- 查询缓存是否和库存权威写入分离？
- 下单是否有幂等键和限流排队？
- 区间库存扣减是否原子？
- 支付回调是否使用条件状态更新？
- 超时关单和释放库存是否幂等？
- 是否有孤儿占座扫描和补偿任务？
- 候补和退票是否能正确回补库存？

## 延伸阅读

- [Designing Data-Intensive Applications](https://dataintensive.net/)
- [Google SRE Book: Handling Overload](https://sre.google/sre-book/handling-overload/)
- [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Microservices.io: Saga](https://microservices.io/patterns/data/saga.html)
