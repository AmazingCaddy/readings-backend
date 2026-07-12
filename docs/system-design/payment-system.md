---
title: 支付系统设计
---

# 支付系统设计

支付系统的核心目标是资金状态正确、请求可重试、回调可幂等、账务可对齐。它不追求所有外部渠道调用都同步成功，而是通过状态机、幂等键、渠道流水、对账和补偿保证最终正确。

```mermaid
flowchart LR
    O[Order Service] --> P[Payment Service]
    P --> DB[(Payment DB)]
    P --> C[Payment Channel]
    C --> CB[Callback API]
    CB --> P
    P --> MQ[Payment Events]
    R[Reconcile Job] --> C
    R --> DB
```

## 业务场景与核心挑战

订单服务发起支付，支付系统创建支付单并调用第三方渠道。用户完成支付后，渠道异步回调支付结果。系统还要支持查询支付状态、关闭支付、退款、对账和异常补偿。

核心挑战：

- 创建支付、支付回调、退款请求都可能重复。
- 渠道回调可能延迟、乱序、重复或丢失。
- 用户看到的订单状态要和支付状态最终一致。
- 资金相关操作必须可审计、可对账、可补偿。
- 支付渠道不可用时，主业务要明确失败或处理中边界。

## 功能需求与非功能需求

功能需求：创建支付单、拉起渠道支付、接收回调、查询状态、关闭支付、发起退款、对账、补偿通知订单。

非功能需求：

- 同一业务支付请求只能创建一笔有效支付单。
- 回调和查询补偿都要幂等推进状态。
- 资金状态变化必须有流水和审计日志。
- 支付成功事件不能丢，订单服务最终能收到。
- 支付和退款链路要有可观测性和告警。

## 核心数据模型

| 表/存储 | 关键字段 | 说明 |
| --- | --- | --- |
| `payment_orders` | `payment_id`, `merchant_order_id`, `status`, `amount` | 支付单 |
| `payment_attempts` | `attempt_id`, `payment_id`, `channel`, `channel_trade_no` | 渠道请求记录 |
| `payment_callbacks` | `callback_id`, `channel`, `event_id`, `payload_hash` | 回调去重 |
| `refund_orders` | `refund_id`, `payment_id`, `status`, `amount` | 退款单 |
| `accounting_entries` | `entry_id`, `biz_id`, `direction`, `amount` | 账务流水 |
| `outbox_events` | `event_id`, `event_type`, `payload`, `status` | 支付事件可靠发布 |

`merchant_order_id`、`payment_request_id`、`channel_trade_no`、`refund_request_id` 都应该有唯一约束。

## 高层架构图

```mermaid
flowchart TD
    Order[Order Service] --> PayAPI[Payment API]
    PayAPI --> Idem[Idempotency Check]
    Idem --> PayDB[(Payment DB)]
    PayAPI --> Channel[Channel Adapter]
    Channel --> ThirdParty[Wechat/Alipay/Card]
    ThirdParty --> Callback[Callback API]
    Callback --> PayDB
    PayDB --> Outbox[(Outbox)]
    Outbox --> MQ[Payment Events]
    MQ --> Order
    Reconcile[Reconcile Job] --> ThirdParty
    Reconcile --> PayDB
```

## 关键流程时序图

创建支付单时，内部支付单和渠道请求要用幂等键保护。

```mermaid
sequenceDiagram
    participant O as Order Service
    participant P as Payment API
    participant DB as Payment DB
    participant C as Channel

    O->>P: create payment request_id=r1
    P->>DB: find or create payment by r1
    P->>C: create channel payment
    C-->>P: channel_trade_no
    P->>DB: save attempt and payment url
    P-->>O: payment url or processing
```

渠道回调只负责幂等推进支付状态，不直接相信请求顺序。

```mermaid
sequenceDiagram
    participant C as Channel
    participant CB as Callback API
    participant DB as Payment DB
    participant MQ as MQ

    C->>CB: payment success callback
    CB->>CB: verify signature
    CB->>DB: insert callback event if absent
    CB->>DB: update Paying -> Succeeded
    CB->>DB: insert accounting entry and outbox
    CB->>MQ: publish PaymentSucceeded by outbox
```

## 一致性与状态机

支付状态只能单向推进。重复回调、主动查单和对账任务都走同一套状态机。

```mermaid
stateDiagram-v2
    [*] --> Created
    Created --> Paying: channel request accepted
    Paying --> Succeeded: callback or query success
    Paying --> Failed: channel confirms failed
    Paying --> Closed: timeout close
    Succeeded --> RefundPending: refund requested
    RefundPending --> Refunded: refund success
    Failed --> [*]
    Closed --> [*]
    Refunded --> [*]
```

账务流水建议和状态变更在同一个本地事务里写入。支付成功事件通过 outbox 发布，订单服务幂等消费后把订单置为已支付。

## 高并发瓶颈分析

- **创建支付单**：用户重复点击和订单服务重试会造成重复创建，需要幂等键。
- **渠道回调**：回调可能集中到达，签名验签和数据库状态更新要轻量。
- **状态查询**：用户支付后频繁刷新结果，需要缓存短时间的支付状态。
- **退款**：退款通常比支付低频，但资金风险更高，要严格审计。
- **对账**：大批量账单处理不能影响在线支付链路。

## 缓存、MQ、数据库的使用方式

- 数据库是支付状态、渠道流水和账务流水的权威存储。
- Redis 可缓存短期支付状态和幂等处理中状态，但不能替代数据库约束。
- MQ 用于通知订单、积分、财务、风控等下游支付结果。
- Outbox 保证支付成功、退款成功等事件可靠发布。
- 对账任务从渠道账单和本地流水比对，发现差异后生成补偿工单或自动修复任务。

## 失败场景与补偿

- 创建渠道支付超时：本地状态保持 `Paying` 或 `Unknown`，通过查单确认。
- 回调丢失：定时查单或对账任务补偿支付结果。
- 回调重复：回调事件唯一约束和状态条件更新保证幂等。
- 支付成功事件发布失败：Outbox publisher 重试，订单服务幂等消费。
- 退款成功但通知失败：退款状态以支付库为准，下游通过事件重放恢复。
- 本地和渠道账单不一致：对账生成差错记录，进入人工或自动补偿流程。

## 扩展方案与取舍

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| 每渠道 adapter | 隔离渠道差异 | 需要统一错误码和状态映射 |
| 幂等表 + 唯一约束 | 重试安全 | 需要处理 processing 超时 |
| 查单补偿 | 弥补回调丢失 | 增加渠道 API 调用 |
| Outbox 事件 | 支付事件不丢 | 下游必须幂等消费 |
| 日终对账 | 资金闭环 | 延迟发现部分问题 |

## 面试版总结

支付系统要围绕状态机和幂等设计。创建支付单用业务请求号去重，渠道调用保存 attempt，回调用事件 ID 去重并验签。支付状态只能从 Created/Paying 推进到 Succeeded、Failed 或 Closed。支付成功后同一事务写账务流水和 outbox 事件，订单服务异步幂等消费。回调丢失靠查单和对账补偿，账务差异要有审计和处理流程。

## 工程检查清单

- 创建支付、回调、退款是否都有幂等键和唯一约束？
- 渠道回调是否验签、去重、条件更新状态？
- 支付状态机是否禁止非法回退和覆盖？
- 支付成功是否写账务流水和 outbox 事件？
- 订单服务消费支付事件是否幂等？
- 是否有查单、关单、退款和对账补偿任务？
- 是否有资金差错告警、审计日志和人工处理入口？

## 延伸阅读

- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Microservices.io: Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [AWS Builders Library: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
- [Google SRE Book: Data Integrity](https://sre.google/sre-book/data-integrity/)
