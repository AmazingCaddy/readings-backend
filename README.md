# Backend Readings

面向已有前端、客户端或简单后端经验的后端学习资料站，重点整理高并发、高性能、高可靠系统开发所需的核心机制、工程实践和系统设计案例。

站点使用 [Docusaurus](https://docusaurus.io/) 构建，支持 Mermaid 图表、Markdown/MDX 文档和 GitHub Pages 自动部署。

## 本地预览

```bash
npm install
npm run start
```

默认本地地址是 `http://localhost:3000/readings-backend/`。

## 构建

```bash
npm run build
```

构建产物会输出到 `build/`。

## 章节结构

- 基础机制：请求生命周期、HTTP 超时重试、并发模型、连接池
- 数据库：索引与慢查询、事务隔离、数据库锁、分页优化
- 缓存：cache-aside、缓存穿透、缓存击穿、缓存雪崩、热 key、分布式锁
- 消息队列：基础模型、幂等消费、重试与死信队列、Outbox Pattern
- 可靠性设计：超时、重试、幂等、限流、熔断与降级
- 性能与观测：压测、P99 延迟、日志、指标、链路追踪、SLO
- 系统设计与实践：订单系统、高并发下单系统

## GitHub Pages

`.github/workflows/deploy.yml` 会在 `main` 分支 push 后自动构建并部署到 GitHub Pages。首次使用时，需要在 GitHub 仓库设置里把 Pages source 配置为 **GitHub Actions**。
