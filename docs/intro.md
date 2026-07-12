---
title: 学习路径
slug: /
---

# Backend Readings

这是一份面向已有前端、客户端或简单后端经验的后端学习手册。重点不是语法入门，而是系统性理解高并发、高性能、高可靠服务背后的工程机制。

站点里的正文文章尽量遵循同一个结构：

- **它是什么**：先定义概念和适用边界。
- **为什么需要它**：解释它解决的是哪类工程压力。
- **它解决什么问题**：把问题拆成可识别的线上症状。
- **核心原理**：用流程图、时序图或状态图解释机制。
- **最小示例**：用 Java、Go、TypeScript、Python 给出可迁移的实现片段。
- **工程实践**：讨论超时、重试、幂等、监控、降级等边界。
- **常见坑**：列出真实系统里容易踩的问题。
- **完整案例**：用一个业务场景把知识点串起来。
- **检查清单**：方便实现或复盘时逐项确认。
- **延伸阅读**：链接官方文档、经典工程文章和论文。

## 推荐阅读顺序

<div className="learning-card-grid">
  <div className="learning-card">
    <h3>1. 基础机制</h3>
    <p>先理解请求生命周期、HTTP 超时与重试、并发模型和连接池。</p>
  </div>
  <div className="learning-card">
    <h3>2. 数据库</h3>
    <p>把索引、慢查询、事务隔离级别、数据库锁和分页优化串起来。</p>
  </div>
  <div className="learning-card">
    <h3>3. 缓存</h3>
    <p>学习 Cache-Aside、缓存击穿、穿透、雪崩、热 Key 和 Redis 分布式锁。</p>
  </div>
  <div className="learning-card">
    <h3>4. 消息与可靠性</h3>
    <p>学习 MQ、幂等消费、重试、死信队列、Outbox、限流、熔断和降级。</p>
  </div>
  <div className="learning-card">
    <h3>5. 性能与观测</h3>
    <p>用压测、P99、日志、指标、链路追踪、SLO 和告警定位瓶颈。</p>
  </div>
  <div className="learning-card">
    <h3>6. 系统设计实践</h3>
    <p>通过订单系统和高并发下单案例把状态机、库存、支付和异步事件组合起来。</p>
  </div>
</div>

## 第一阶段：建立请求视角

目标是能从一次请求进入系统开始，解释它经过哪些组件、会在哪里排队、为什么会超时、如何设置边界。

- [一个请求的完整生命周期](./fundamentals/request-lifecycle.md)
- [HTTP 超时与重试](./fundamentals/http-timeout-retry.md)
- [并发模型](./fundamentals/concurrency-model.md)
- [连接池](./fundamentals/connection-pool.md)
- [超时控制](./reliability/timeout.md)
- [重试策略](./reliability/retry.md)

阶段产出：能画出一个接口从网关到数据库和下游 RPC 的时序图，并能为每一段设置合理 timeout、retry 和连接池参数。

## 第二阶段：掌握数据和缓存

目标是理解大多数后端性能问题的根源：数据库访问路径、事务并发、锁等待、缓存一致性和缓存失效模式。

- [数据库索引与慢查询](./database/index-and-slow-query.md)
- [事务隔离级别](./database/transaction-isolation.md)
- [数据库锁](./database/database-locks.md)
- [分页优化](./database/pagination.md)
- [Cache-Aside 模式](./cache/cache-aside.md)
- [Redis 缓存击穿](./cache/cache-breakdown.md)
- [缓存穿透](./cache/cache-penetration.md)
- [缓存雪崩](./cache/cache-avalanche.md)
- [热 Key](./cache/hot-key.md)
- [Redis 分布式锁](./cache/distributed-lock.md)

阶段产出：能根据慢接口的 explain、缓存命中率、Redis 分片指标和连接池等待，判断瓶颈是在数据库、缓存还是应用层。

## 第三阶段：异步化和可靠性

目标是理解为什么高可靠系统一定要处理重复、乱序、失败重试和最终一致性。

- [MQ 基础模型](./messaging/mq-basics.md)
- [MQ 幂等消费](./messaging/idempotent-consumer.md)
- [重试与死信队列](./messaging/retry-dlq.md)
- [Outbox Pattern](./messaging/outbox-pattern.md)
- [幂等设计](./reliability/idempotency.md)
- [限流](./reliability/rate-limit.md)
- [熔断与降级](./reliability/circuit-breaker.md)

阶段产出：能设计一个“订单创建后异步通知库存、搜索和通知系统”的事件链路，并说明如何避免消息丢失、重复消费和坏消息阻塞。

## 第四阶段：性能和可观测性

目标是从“感觉慢”转成“有证据地定位瓶颈”。你需要能定义指标、设计压测、读懂 P99、用 trace 拆解耗时，并用 SLO 决定告警优先级。

- [压测方法](./performance/load-testing.md)
- [P99 延迟](./performance/p99-latency.md)
- [日志、指标与链路追踪](./observability/logging-metrics-tracing.md)
- [SLO 与告警](./observability/slo-alerting.md)

阶段产出：能为一个核心接口定义 SLI/SLO，设计压测场景，观察 P95/P99、错误率、队列积压和下游耗时，并给出优化方案。

## 第五阶段：系统设计实践

目标是把前面的机制组合成完整业务系统。系统设计不是堆技术名词，而是说明状态、边界、失败模式和恢复路径。

- [订单系统设计](./system-design/order-system.md)
- [高并发下单系统设计](./practice/high-concurrency-order-system.md)

阶段产出：能设计一个高并发下单链路，说明库存如何扣减、支付回调如何幂等、订单事件如何可靠发布、热点和限流如何处理、系统如何观测和恢复。

## 学习方法

建议每篇文章按下面顺序使用：

1. 先看开头图，确认自己能复述问题场景。
2. 再看核心原理，手动画一遍时序图或状态图。
3. 对照四种语言示例，抽象出共同模式，而不是记某个库的 API。
4. 阅读完整案例，列出失败模式和兜底策略。
5. 用检查清单审视自己做过的项目，找出缺失项。

## 后续扩展方向

当前内容已经覆盖后端高并发、高性能、高可靠的核心基础。后续可以继续扩展这些专题：

- **架构治理**：服务发现、配置中心、灰度发布、蓝绿发布、回滚策略。
- **数据扩展**：读写分离、分库分表、CDC、数据迁移、归档和冷热分层。
- **安全基础**：认证授权、OAuth/OIDC、权限模型、审计日志、密钥管理。
- **云原生运行**：容器、Kubernetes、弹性伸缩、探针、资源配额。
- **稳定性演练**：故障注入、混沌工程、容量预案、应急 runbook。
- **案例实践**：秒杀系统、支付系统、通知系统、搜索索引同步、数据看板。

## 参考资料入口

- [Google SRE Book](https://sre.google/books/)
- [Designing Data-Intensive Applications](https://dataintensive.net/)
- [AWS Architecture Center](https://aws.amazon.com/architecture/)
- [AWS Builders Library](https://aws.amazon.com/builders-library/)
- [Martin Fowler](https://martinfowler.com/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
