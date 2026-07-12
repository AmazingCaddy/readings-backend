// @ts-check

const sidebars = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: '基础机制',
      items: [
        'fundamentals/request-lifecycle',
        'fundamentals/http-timeout-retry',
        'fundamentals/concurrency-model',
        'fundamentals/connection-pool',
      ],
    },
    {
      type: 'category',
      label: '数据库',
      items: [
        'database/index-and-slow-query',
        'database/transaction-isolation',
        'database/database-locks',
        'database/pagination',
      ],
    },
    {
      type: 'category',
      label: '缓存',
      items: [
        'cache/cache-aside',
        'cache/cache-breakdown',
        'cache/cache-penetration',
        'cache/cache-avalanche',
        'cache/hot-key',
        'cache/distributed-lock',
      ],
    },
    {
      type: 'category',
      label: '消息队列',
      items: [
        'messaging/mq-basics',
        'messaging/idempotent-consumer',
        'messaging/retry-dlq',
        'messaging/outbox-pattern',
      ],
    },
    {
      type: 'category',
      label: '可靠性设计',
      items: [
        'reliability/timeout',
        'reliability/retry',
        'reliability/idempotency',
        'reliability/rate-limit',
        'reliability/circuit-breaker',
      ],
    },
    {
      type: 'category',
      label: '性能与观测',
      items: [
        'performance/load-testing',
        'performance/p99-latency',
        'observability/logging-metrics-tracing',
        'observability/slo-alerting',
      ],
    },
    {
      type: 'category',
      label: '系统设计与项目实践',
      items: [
        'system-design/order-system',
        'system-design/weibo-feed-system',
        'practice/high-concurrency-order-system',
      ],
    },
  ],
};

module.exports = sidebars;
