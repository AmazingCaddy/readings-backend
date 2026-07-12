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
      label: '工程配方',
      items: [
        'recipes/redis-key-design',
        'recipes/idempotency-key-design',
        'recipes/database-index-design',
        'recipes/mq-topic-message-key-design',
        'recipes/outbox-table-design',
        'recipes/order-state-machine-design',
        'recipes/rate-limit-rule-design',
        'recipes/metrics-alerting-design',
      ],
    },
    {
      type: 'category',
      label: '后端面试路径',
      items: [
        'interview/backend-api-layering',
        'interview/database-modeling-concurrency',
        'interview/backend-interview-qa',
        'interview/production-troubleshooting',
      ],
    },
    {
      type: 'category',
      label: '系统设计与项目实践',
      items: [
        'system-design/glossary',
        'system-design/order-system',
        'system-design/weibo-feed-system',
        'system-design/train-ticket-system',
        'system-design/flash-sale-system',
        'system-design/payment-system',
        'system-design/short-url-system',
        'system-design/comment-like-system',
        'system-design/notification-system',
        'system-design/instant-messaging-system',
        'practice/high-concurrency-order-system',
      ],
    },
  ],
};

module.exports = sidebars;
