# Docs Review Fix List

This file tracks correctness issues found during the full review of the backend learning docs. Fixes should be applied from high risk to low risk, and each item should be checked after the related article is updated.

## High Risk

- [x] `docs/messaging/retry-dlq.md:91`: retry/DLQ examples publish retry or DLQ messages and then ack the original message, but they do not handle publish failure. If publish fails and ack succeeds, the original message is lost. Fix examples so ack only happens after retry/DLQ publish succeeds, and publish errors are surfaced for broker redelivery.
- [x] `docs/collaboration/worker-mq-consumption.md:72`, `docs/collaboration/worker-mq-consumption.md:195`: same publish-then-ack risk in worker retry examples. Fix the worker flow and `retryLater` pseudo-code to avoid swallowing publish failures.
- [x] `docs/reliability/idempotency.md:96`: examples call `insertIfAbsent` but do not branch on whether the insert actually happened. Duplicate requests may continue and create a second payment. Fix all language snippets to return existing result or conflict on duplicate keys, and emphasize request hash checks.
- [x] `docs/collaboration/order-flow-collaboration.md:99`: Redis idempotency placeholder is written before DB authority rows. A duplicate request between `SETNX PROCESSING` and DB insert may read an empty DB result. `SOLD_OUT` exists only in Redis, while duplicate lookup reads DB only. Also the outbox payload misses `orderToken` and `skuId`, although the worker expects them, and `order_requests.sku_id` is not inserted. Fix the API flow so DB request status plus outbox is the authority, Redis is only a fast guard, duplicate reads handle Redis/DB processing states, and payload/schema fields match worker expectations.
- [x] `docs/practice/high-concurrency-order-system.md:87`: `Redis DECR -> MQ publish` can lose accepted orders if the process crashes between decrement and publish. Rewrite as request status plus outbox/producer confirm and compensation scanner, or explicitly mark the minimal example as unsafe for production.
- [x] `docs/system-design/flash-sale-system.md:98`: same `DECR -> MQ publish` loss window. Fix the flow to persist accepted request/outbox before returning `202`, and recover publish failures or replenish stock through a scanner.
- [x] `docs/system-design/train-ticket-system.md:260`: interval inventory SQL uses station-name comparisons and does not verify affected segment count. It may partially decrement inventory. Use station indexes or `segment_index`, and require affected rows equals the expected segment count in one transaction, otherwise roll back.
- [x] `docs/system-design/payment-system.md:115`: callback flow verifies signature but does not explicitly validate amount, currency, merchant order id, payment id, and channel trade id before status update. Add these validations before any success transition.

## Medium Risk

- [ ] `docs/collaboration/cdc-search-index-sync.md:111`: `search.get -> compare rowVersion -> upsert` is not atomic and can let stale data overwrite new data. Use Elasticsearch/OpenSearch external versioning or a conditional scripted update.
- [ ] `docs/algorithms/rate-limit-algorithms.md:61`: Redis ZSet sliding window pseudo operations are not atomic. Wrap `ZREMRANGEBYSCORE`, `ZCARD`, `ZADD`, and `EXPIRE` in Lua or a transaction, and use unique members.
- [ ] `docs/algorithms/lease-fencing-token.md:97`: when no lease row exists, the pseudo-code reads `lease.last_token + 1`. Use default token `1` or a separate monotonic sequence.
- [ ] `docs/collaboration/redis-database-consistency.md:174`: treating Redis `DEL` return value `0` as delete failure is wrong because it can mean the key was already absent. Compensation should be triggered by Redis exception or timeout, not by deleted count `0`.
- [ ] `docs/collaboration/read-write-splitting-cache.md:89`: same Redis `DEL == 0` issue.
- [ ] `docs/collaboration/read-write-splitting-cache.md:69`: null marker key is defined but `getProfile` does not read it. Fix pseudo-code to check `user:profile:null:{user_id}` before querying DB.
- [ ] `docs/collaboration/multi-level-cache.md:100`: cache rebuild lock uses a fixed value and direct delete, so one worker can delete another worker's lock. Use a random token plus Lua compare-and-delete unlock.
- [ ] `docs/observability/logging-metrics-tracing.md:51`: text says trace id should flow through metrics labels, conflicting with the high-cardinality warning. Trace id belongs in logs, traces, and exemplars, not normal metric labels.
- [x] `docs/system-design/payment-system.md:237`: `unique(channel, channel_trade_no)` with nullable `channel_trade_no` may allow multiple NULL values. Make it non-null after known, or use a partial unique index where `channel_trade_no is not null`.
- [ ] `docs/database/database-locks.md:186`: Go code uses `ExecContext` for `SELECT ... FOR UPDATE`; use `QueryRowContext` and scan the row.
- [ ] `docs/database/database-locks.md:202`: TypeScript `[fromId, toId].sort()` sorts lexicographically by default and can produce the wrong numeric lock order. Use numeric or canonical comparison.

## Low Risk

- [ ] `docs/fundamentals/http-timeout-retry.md:141`: Java retry sample can return a final `429` or `503` response as if it succeeded. Throw on final retryable status or check `>= 400` before returning.
- [ ] `docs/cache/cache-aside.md:237`: Redis errors are treated like cache misses and fall through to DB, which can amplify DB load during Redis outages. Distinguish miss from Redis error and use degradation, fail-fast, or limited fallback.
- [ ] `docs/recipes/outbox-table-design.md:92`: `FOR UPDATE SKIP LOCKED` publisher transaction boundary is unclear. Use a short transaction to claim rows, publish outside the transaction, mark result afterward, and recover stale `publishing` rows.
- [ ] `docs/system-design/instant-messaging-system.md:303`: Redis `INCR` allocates sequence before DB insert, so DB insert failure can create permanent sequence gaps. Mention that gaps must be tolerated with client gap timeout, or allocate sequence in the DB transaction / sequence service with retry semantics.
