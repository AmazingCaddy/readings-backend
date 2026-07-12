import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);

const state = {
  stock: new Map([['sku_1001', 5]]),
  idempotency: new Map(),
  orders: new Map(),
  queue: [],
  metrics: {
    accepted: 0,
    duplicates: 0,
    soldOut: 0,
    created: 0,
    failed: 0,
  },
};

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createOrderCommand({ userId, skuId, quantity, idempotencyKey }) {
  const existing = state.idempotency.get(idempotencyKey);
  if (existing) {
    state.metrics.duplicates += 1;
    return { duplicate: true, result: existing };
  }

  const available = state.stock.get(skuId) ?? 0;
  if (available < quantity) {
    state.metrics.soldOut += 1;
    const result = { status: 'SOLD_OUT', skuId };
    state.idempotency.set(idempotencyKey, result);
    return { duplicate: false, result };
  }

  state.stock.set(skuId, available - quantity);
  const orderToken = `ord_${randomUUID()}`;
  const result = { status: 'QUEUED', orderToken, skuId };
  state.idempotency.set(idempotencyKey, result);
  state.queue.push({ orderToken, userId, skuId, quantity, idempotencyKey });
  state.metrics.accepted += 1;
  return { duplicate: false, result };
}

function workerTick() {
  const command = state.queue.shift();
  if (!command) return;

  try {
    const order = {
      orderId: command.orderToken,
      userId: command.userId,
      skuId: command.skuId,
      quantity: command.quantity,
      status: 'PENDING_PAYMENT',
      createdAt: new Date().toISOString(),
    };
    state.orders.set(command.orderToken, order);
    state.idempotency.set(command.idempotencyKey, {
      status: 'CREATED',
      orderToken: command.orderToken,
      skuId: command.skuId,
    });
    state.metrics.created += 1;
  } catch (error) {
    const current = state.stock.get(command.skuId) ?? 0;
    state.stock.set(command.skuId, current + command.quantity);
    state.idempotency.set(command.idempotencyKey, {
      status: 'FAILED',
      reason: error.message,
    });
    state.metrics.failed += 1;
  }
}

setInterval(workerTick, 200);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const traceId = req.headers['x-trace-id'] || `tr_${randomUUID()}`;

  try {
    if (req.method === 'POST' && url.pathname === '/orders') {
      const body = await readJson(req);
      const idempotencyKey = req.headers['idempotency-key'];

      if (!idempotencyKey) {
        return json(res, 400, { code: 'MISSING_IDEMPOTENCY_KEY', traceId });
      }

      if (!body.userId || !body.skuId || !Number.isInteger(body.quantity) || body.quantity <= 0) {
        return json(res, 400, { code: 'INVALID_ARGUMENT', traceId });
      }

      const { duplicate, result } = createOrderCommand({
        userId: String(body.userId),
        skuId: String(body.skuId),
        quantity: body.quantity,
        idempotencyKey: String(idempotencyKey),
      });

      if (result.status === 'SOLD_OUT') {
        return json(res, 409, { code: 'SOLD_OUT', data: result, traceId });
      }

      return json(res, duplicate ? 200 : 202, { code: 'OK', data: result, traceId });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/orders/')) {
      const orderToken = url.pathname.split('/').at(-1);
      const order = state.orders.get(orderToken);
      if (!order) return json(res, 202, { code: 'PROCESSING', traceId });
      return json(res, 200, { code: 'OK', data: order, traceId });
    }

    if (req.method === 'GET' && url.pathname === '/metrics') {
      return json(res, 200, {
        code: 'OK',
        data: {
          stock: Object.fromEntries(state.stock),
          queueLength: state.queue.length,
          orders: state.orders.size,
          metrics: state.metrics,
        },
        traceId,
      });
    }

    return json(res, 404, { code: 'NOT_FOUND', traceId });
  } catch (error) {
    return json(res, 500, { code: 'INTERNAL', message: error.message, traceId });
  }
});

server.listen(PORT, () => {
  console.log(`high-concurrency-order example listening on http://localhost:${PORT}`);
  console.log('try: curl -X POST http://localhost:3000/orders -H "content-type: application/json" -H "idempotency-key: req_1" -d \'{"userId":"u1","skuId":"sku_1001","quantity":1}\'');
});
