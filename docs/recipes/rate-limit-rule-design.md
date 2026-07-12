---
title: 限流规则设计实战
---

# 限流规则设计实战

限流规则不是只写一个 QPS 数字。真正要设计的是：限制谁、限制什么资源、窗口多长、超限后怎么办、是否允许排队、如何避免误伤核心用户。

## 使用场景

常见限流对象：

- 登录接口：按 IP、账号、设备限流。
- 发送验证码：按手机号、IP、设备限流。
- 下单接口：按用户、商品、活动限流。
- 秒杀接口：按活动、SKU、用户限流。
- 第三方 API：按渠道和调用方限流。
- 搜索接口：按用户和关键词限流。

## 规则命名规范

推荐格式：

```text
rate_limit:{scope}:{resource}:{window}
```

例子：

```text
rate_limit:user:{user_id}:order_create:1m
rate_limit:ip:{ip_hash}:login:1m
rate_limit:sku:{sku_id}:seckill:1s
rate_limit:channel:{channel}:payment_create:1m
```

## 推荐规则模板

登录：

```yaml
name: login_by_ip
scope: ip
key: ip_hash
limit: 30
window: 1m
action: reject
response: 429
```

短信验证码：

```yaml
name: sms_by_phone
scope: phone
key: phone_hash
limit: 5
window: 10m
action: reject
response: 429
```

秒杀商品：

```yaml
name: seckill_by_sku
scope: sku
key: activity_id + sku_id
limit: 10000
window: 1s
action: queue_or_reject
response: 202_or_429
```

第三方支付渠道：

```yaml
name: payment_channel_create
scope: channel
key: channel
limit: 500
window: 1s
action: fail_fast
response: 503
```

## 维度选择

| 维度 | 适用场景 | 风险 |
| --- | --- | --- |
| IP | 防攻击、登录保护 | NAT 下误伤多人 |
| 用户 | 防重复操作 | 未登录场景不可用 |
| 设备 | App 防刷 | 设备 ID 可伪造 |
| 资源 | 热点商品、直播间 | 需要识别资源 ID |
| 下游 | 保护支付、短信渠道 | 影响所有上游业务 |
| 全局 | 保护服务总容量 | 粗粒度，容易误伤 |

## 超限动作

| 动作 | 适用场景 | 返回 |
| --- | --- | --- |
| reject | 明确不能处理 | `429 Too Many Requests` |
| queue | 排队等待 | `202 Accepted` + 查询 token |
| degrade | 返回降级结果 | 200 + 降级字段 |
| fail_fast | 保护强依赖 | `503 Service Unavailable` |
| captcha | 可疑用户验证 | 403/428 + 验证要求 |

## 反例

反例 1：只做全局限流。

问题：一个用户刷接口会占掉全站额度，正常用户被误伤。

修正：叠加用户/IP/资源维度。

反例 2：超限后客户端立即重试。

问题：限流被重试抵消，流量更大。

修正：返回 `Retry-After`，客户端退避。

反例 3：限流 key 使用原始手机号。

问题：敏感信息泄露到 Redis key 和日志。

修正：使用 hash 后的手机号。

## 常见坑与修复

| 坑 | 现象 | 修复 |
| --- | --- | --- |
| 阈值拍脑袋 | 误杀或保护不足 | 基于压测和下游容量设置 |
| 本地限流当全局限流 | 扩容后总流量变大 | 使用 Redis/网关全局限流 |
| 只限 QPS 不限并发 | 慢请求仍拖垮服务 | 加并发限制 |
| 超限无监控 | 不知道用户被拒绝多少 | 记录限流命中指标 |
| 没有白名单/灰度 | 误伤内部任务 | 支持规则灰度和豁免 |

## 监控指标

- `rate_limit_allowed_total{rule}`
- `rate_limit_blocked_total{rule,scope}`
- `rate_limit_queue_depth{rule}`
- `rate_limit_wait_ms{rule}`
- `rate_limit_rule_error_total{rule}`
- `api_retry_after_total{route}`

## 完整业务例子

秒杀下单限流：

1. 网关全局限制活动入口总 QPS。
2. 按用户限制每秒最多 1 次提交。
3. 按 SKU 限制进入库存预扣的 QPS。
4. 超过用户限制返回 429。
5. 超过 SKU 限制进入排队或返回售罄。
6. 排队成功返回 `202 Accepted` 和 `request_id`。
7. 用户用 `request_id` 查询最终结果。

Redis key：

```text
rate_limit:user:{user_id}:seckill:{activity_id}:1s
rate_limit:sku:{sku_id}:seckill:{activity_id}:1s
```

## 检查清单

- 限流保护的是入口、用户、资源还是下游？
- key 是否避免敏感信息？
- 阈值是否来自容量评估或压测？
- 超限后是拒绝、排队还是降级？
- 是否返回 `Retry-After`？
- 是否监控 allowed、blocked、queue depth？
- 是否支持灰度、白名单和快速调整？
