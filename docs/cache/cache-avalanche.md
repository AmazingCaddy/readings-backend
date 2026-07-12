---
title: 缓存雪崩
---

# 缓存雪崩

缓存雪崩指大量 key 在同一时间失效，或者缓存集群整体不可用，导致请求集中打到数据库。

```mermaid
flowchart LR
    A[Many keys expire together] --> B[Cache miss spike]
    B --> C[DB traffic spike]
    C --> D[Slow queries and timeouts]
```

## 后续扩写

- TTL 随机抖动。
- 缓存预热。
- 多级缓存。
- Redis 故障降级。

## 延伸阅读

- [Redis Reliability](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)
- [Google SRE Book: Handling Overload](https://sre.google/sre-book/handling-overload/)
