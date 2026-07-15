# Conversation Summary: Backend Learning Progress
**Date:** 2026-07-13
**Last Updated:** 2026-07-15 00:00 Asia/Shanghai
**Status:** In Progress

## Objective
Help the user study backend engineering articles from a frontend/client background, add practical project-based learning, and prepare for backend interviews.

## Key Decisions
- **Decision:** Use a learning path that starts with backend request lifecycle, then moves into database, cache, MQ, reliability, observability, and a high-concurrency order project.
  - *Rationale:* This matches the user's frontend/client background and interview-oriented goal.
- **Decision:** Track learning in a Docusaurus document named `docs/study-progress.md`.
  - *Rationale:* The repository is already a Docusaurus documentation site, so a visible docs page is easy to update and review.
- **Decision:** During future learning, summarize and record questions, core conclusions, practical understanding, interview phrasing, and review prompts.
  - *Rationale:* The user expects many follow-up questions while learning and wants timely summaries and progress tracking.
- **Decision:** Use guided and Socratic teaching: first assess the user's current understanding, then tailor explanations to their frontend/client background.
  - *Rationale:* The user explicitly wants guided, exploratory learning with targeted explanations rather than one-way lecturing.
- **Decision:** Preserve the user's short answers and also record the fuller reasoning behind them.
  - *Rationale:* The user often answers briefly, but wants the longer explanation, boundaries, and follow-up reasoning captured for later review.
- **Decision:** Keep `docs/study-progress.md` as a lightweight overview and store detailed per-lesson notes under `docs/study/lessons/`.
  - *Rationale:* The user noticed that keeping every lesson in one document would make it too large over time.
- **Decision:** After each lesson review, compare the lesson Q&A against the source article and update the original article when the user's questions reveal missing practical boundaries, interview follow-ups, or troubleshooting steps.
  - *Rationale:* The user wants future learning to improve both personal lesson notes and the underlying backend study articles.

## Progress
1. Explored the repository structure and confirmed it is a backend learning documentation site.
2. Read `README.md`, `sidebars.js`, and `docs/intro.md` to understand the article layout.
3. Read `docs/fundamentals/request-lifecycle.md` and started the first lesson around request lifecycle and P99 latency.
4. Created a learning progress document and added it to the sidebar.
5. Added a learning collaboration section describing how future questions and summaries should be recorded.
6. Added a guided learning method section covering baseline checks, frontend/client analogies, scenarios, review questions, and progress recording.
7. Started guided learning: user identified network latency as the first hypothesis for occasional slow page loads and correctly answered that client-side 2s latency with backend 80ms processing should first point to network/entry/client-side causes.
8. Expanded the learning record format to include the user's short answer plus the full explanation behind it, and backfilled explanations for request lifecycle examples.
9. User formed a first complete interview-style answer for investigating occasional slow APIs: check P99, get slow logs and trace id, distinguish network/client/entry issues from backend processing, then inspect trace span timings and drill into the longest stage.
10. Completed the first request-lifecycle review quiz. User correctly answered all five checks: network vs backend timing, trace span drill-down, DB connection pool vs SQL execution, P95/P99 for long-tail latency, and retry amplification risk.
11. Completed the HTTP timeout and retry lesson review. User correctly explained timeout resource protection, separate timeout types, request budget splitting, retryable vs non-retryable errors, and idempotency for POST /orders retries.
12. Completed the connection pool lesson review. User correctly explained connection reuse and downstream protection, why pools are not larger-is-better, causes of active=max with high pending, slow SQL reducing connection turnover, and why connection timeout must be disambiguated before blaming pool size.
13. Split the large learning progress document into a lightweight overview plus per-lesson notes: `docs/study/lessons/01-request-lifecycle.md`, `docs/study/lessons/02-http-timeout-retry.md`, and `docs/study/lessons/03-connection-pool.md`. Added a sidebar category named `学习记录`.
14. Completed the database index and slow query lesson review. User correctly explained why indexes are not more-is-better, low-selectivity fields like `is_deleted`, deep OFFSET pagination, cursor pagination tradeoffs, and the composite index `(user_id, status, created_at DESC, id DESC)` for order lists.
15. Completed the transaction isolation lesson review. User correctly explained dirty reads, non-repeatable reads, phantom reads, why select-then-update is unsafe for stock, why conditional update prevents overselling, why duplicate order prevention needs unique constraints/idempotency, and why transactions should be short.
16. Completed the database locks lesson review. User correctly explained row update waiting, long transactions increasing lock wait, distinguishing lock wait from SQL execution and connection pool wait, deadlock caused by circular waiting, fixed lock ordering, finite whole-transaction retry after deadlock, index impact on lock range, and batch UPDATE lock troubleshooting.
17. Completed the pagination optimization lesson review. User correctly explained deep OFFSET scanning, unstable sorting with non-unique `created_at`, cursor requiring all sort fields, composite indexes like `(product_id, created_at DESC, id DESC)`, cursor tradeoffs around arbitrary page jumps, avoiding OFFSET loops for large exports, opaque/signed cursor tokens, product tradeoffs for total pages, and using EXPLAIN plus P99 metrics to validate改造.
18. Completed the Cache-Aside lesson review. User correctly explained read-heavy product detail caching, null marker caching for missing data, TTL tradeoffs, update-DB-then-delete-cache write path, short inconsistency windows, TTL jitter, Redis outage回源 protection, strong-consistency boundaries, key design and user-specific fields reducing hit rate.
19. Updated the original Cache-Aside article based on the user's Q&A insights: added回源保护, key dimension design, version-control caveats for read/write races, Redis outage database protection, hit-rate troubleshooting, and clarified strong-consistency boundaries.
20. Reviewed lessons 1-7 against their source articles and updated originals with the user's Q&A-derived gaps: client/server timing comparison, idempotency processing states, retry budget implementation, connection timeout disambiguation, pool sizing from total DB capacity, low-selectivity indexes, covering-index restraint, affected rows semantics, duplicate-order unique constraints, whole-transaction retry, lock-wait/pool-wait coupling, batch UPDATE lock troubleshooting, and deep-pagination design alternatives.

## Technical Context
- Files modified: `docs/study-progress.md`, `sidebars.js`, `docs/local/summaries/2026-07-13-backend-learning-progress.md`, `docs/study/lessons/01-request-lifecycle.md`, `docs/study/lessons/02-http-timeout-retry.md`, `docs/study/lessons/03-connection-pool.md`, `docs/study/lessons/04-index-and-slow-query.md`, `docs/study/lessons/05-transaction-isolation.md`, `docs/study/lessons/06-database-locks.md`, `docs/study/lessons/07-pagination.md`, `docs/study/lessons/08-cache-aside.md`, `docs/cache/cache-aside.md`, `docs/fundamentals/request-lifecycle.md`, `docs/fundamentals/http-timeout-retry.md`, `docs/fundamentals/connection-pool.md`, `docs/database/index-and-slow-query.md`, `docs/database/transaction-isolation.md`, `docs/database/database-locks.md`, `docs/database/pagination.md`
- Files explored: `README.md`, `sidebars.js`, `docs/intro.md`, `docs/fundamentals/request-lifecycle.md`, `docs/fundamentals/http-timeout-retry.md`, `docs/fundamentals/connection-pool.md`, `docs/database/database-locks.md`, `docs/database/pagination.md`, `docs/cache/cache-aside.md`
- Dependencies: Docusaurus docs site

## Open Questions
- Continue to `docs/cache/cache-breakdown.md` next to learn cache breakdown/hot key protection, or first turn Cache-Aside into an interview answer set.

## Blockers
(none currently)
