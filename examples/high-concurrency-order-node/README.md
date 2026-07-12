# High Concurrency Order Example

This is a zero-dependency Node.js demo for learning backend interview concepts.
It simulates idempotent order creation, stock pre-deduction, an async worker queue,
order status polling, and basic metrics.

Run it:

```bash
npm start
```

Create an order:

```bash
curl -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -H 'idempotency-key: req_1' \
  -d '{"userId":"u1","skuId":"sku_1001","quantity":1}'
```

Check metrics:

```bash
curl http://localhost:3000/metrics
```

The implementation intentionally uses in-memory maps so the core flow is easy to
read. In a production version, replace the in-memory state with Redis, MySQL,
and a real MQ.
