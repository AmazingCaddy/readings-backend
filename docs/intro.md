---
title: 学习路径
slug: /
---

# Backend Readings

这是一份面向已有前端、客户端或简单后端经验的后端学习手册。重点不是语法入门，而是系统性理解高并发、高性能、高可靠服务背后的工程机制。

每篇正文尽量遵循同一个结构：

- **问题场景**：先给一个真实业务问题。
- **图表推演**：用时序图、流程图或状态图解释系统行为。
- **示例代码**：给出最小但贴近工程的实现片段。
- **常见错误**：列出线上容易踩的坑。
- **工程化方案**：讨论超时、重试、幂等、监控、降级等边界。
- **延伸阅读**：优先链接官方文档、经典工程文章和论文。

## 推荐阅读顺序

<div className="learning-card-grid">
  <div className="learning-card">
    <h3>1. 基础机制</h3>
    <p>先理解请求生命周期、连接池、超时、重试和并发模型。</p>
  </div>
  <div className="learning-card">
    <h3>2. 数据与缓存</h3>
    <p>把索引、事务、锁、Redis 缓存模式和一致性问题串起来。</p>
  </div>
  <div className="learning-card">
    <h3>3. 异步与可靠性</h3>
    <p>学习 MQ、幂等、重试、死信队列、限流、熔断和降级。</p>
  </div>
  <div className="learning-card">
    <h3>4. 性能与观测</h3>
    <p>用压测、日志、指标和链路追踪定位瓶颈，而不是凭感觉优化。</p>
  </div>
  <div className="learning-card">
    <h3>5. 系统设计实践</h3>
    <p>通过订单、秒杀、支付回调等案例把知识点组合起来。</p>
  </div>
</div>

## 第一批重点文章

- [一个请求的完整生命周期](./fundamentals/request-lifecycle.md)
- [数据库索引与慢查询](./database/index-and-slow-query.md)
- [Redis 缓存击穿](./cache/cache-breakdown.md)
- [MQ 幂等消费](./messaging/idempotent-consumer.md)
- [高并发下单系统设计](./practice/high-concurrency-order-system.md)

## 参考资料入口

- [Google SRE Book](https://sre.google/books/)
- [Designing Data-Intensive Applications](https://dataintensive.net/)
- [AWS Architecture Center](https://aws.amazon.com/architecture/)
- [Martin Fowler](https://martinfowler.com/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
