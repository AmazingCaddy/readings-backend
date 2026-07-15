---
title: 第七课：分页优化
---

# 第七课：分页优化

原文：[分页优化](../../database/pagination.md)

## 核心理解

分页慢通常不是“只返回 20 条也很慢”，而是数据库为了找到这 20 条，可能先扫描、排序并丢弃大量前置记录。`OFFSET` 越深，处理的无用数据越多；高频大表列表更适合 cursor pagination，用上一页最后一条记录的位置继续查询，让延迟随页数增长更稳定。

## 问答沉淀

| 问题 | 当前回答 | 需要记住的结论 |
| --- | --- | --- |
| `LIMIT 20 OFFSET 100000` 为什么可能很慢？它能直接跳到第 100001 条吗？ | 不能，它是取了 100020 行，从第 100001 行开始取 20 行 | OFFSET 深分页通常要先按条件和排序找到前 `offset + limit` 条记录，再丢弃前 `offset` 条，只返回最后 `limit` 条；页数越深，无效扫描越多。 |
| 为什么分页只用 `ORDER BY created_at DESC` 可能不稳定？ | 很多排序算法是不稳定的，相同的 created_at 每次排序时，出现在最终排序结果的位置不同，导致分页结果也不稳定 | `created_at` 不是唯一排序键，同一时间的多条记录没有确定顺序；分页时可能出现重复或遗漏，通常要加 `id DESC` 作为稳定 tie-breaker。 |
| Cursor pagination 为什么要同时带 `created_at` 和 `id`？只带 `created_at` 行不行？ | 不行，原因跟前一题类似，相同的 created_at 可能有好多 | 游标必须包含所有排序字段。只带 `created_at` 无法定位到上一页最后一条的精确位置，可能跳过或重复同一时间的记录。 |
| `WHERE user_id = ?` 加 `ORDER BY created_at DESC, id DESC` 的 cursor 分页应该建什么组合索引？ | `index(user_id, created_at desc, id desc)` | `user_id` 先缩小用户订单范围，`created_at DESC, id DESC` 匹配排序和游标条件，让数据库沿索引顺序继续扫描并尽快取够 20 条。 |
| Cursor pagination 相比 OFFSET pagination 有什么代价？能直接跳到第 100 页吗？ | 代价是不能跳到特定的页。cursor pagination 需要知道上一个 cursor，所以做不了 | Cursor 更适合下一页/无限滚动，不天然支持任意跳页；如果业务必须跳页，可以保留受限 OFFSET、维护页码游标映射，或改成交互设计。 |
| 后台导出 100 万订单时，用循环 `LIMIT 1000 OFFSET n` 会有什么问题？应该怎么改？ | 前面的查询挺快的，offset 越来越大之后，变得越来越慢。可以改成 cursor | OFFSET 批量导出会越导越慢，因为后续批次要跳过越来越多数据；应改成 cursor/keyset 分批扫描，按稳定排序键继续向后取。 |
| `next_cursor` 能不能直接明文返回 `{created_at, id}`？有什么风险？ | 过多暴露数据库细节 | 明文 cursor 会暴露内部排序字段、主键和数据分布，也可能被客户端篡改；工程上通常用 base64 编码 JSON，并加签名或校验防篡改。 |
| 商品评论按时间倒序加载更多，cursor 和组合索引怎么设计？ | `next_cursor: (created_at, id)`, `index(product_id, created_at desc, id desc)` | Cursor 要包含完整排序键；索引用 `product_id` 先过滤商品评论，再用 `created_at DESC, id DESC` 支持稳定排序和下一页 seek。 |
| 评论列表必须展示总页数和任意跳页，但表已经很大，怎么解释取舍？ | 用户一般也是关心最新的评论，不太会去很久的评论，所以跳到任意页的需求挺小 | 时间流/评论列表更适合 cursor 和加载更多；总页数、任意跳页需要额外 count 和深分页成本，应结合业务价值限制或替代设计。 |
| 列表改成 cursor pagination 后线上还是慢，用 EXPLAIN 重点看什么？ | 看是否全表扫描，看 where 字段和排序字段是否在 index 范围内，以及组合索引顺序是否合理 | 重点看是否使用预期组合索引、扫描行数是否小、是否还有 filesort/temporary；cursor 写法正确但索引不匹配仍然会慢。 |
| 什么时候适合 OFFSET pagination，什么时候适合 cursor pagination？ | OFFSET pagination，行数比较少，需要指定页面。cursor pagination，行数很多，不需要指定页面，流式数据，无限下拉 | OFFSET 适合小数据、低频后台和必须跳页的场景；cursor 适合大表、高频列表、时间流和加载更多，能避免深分页无效扫描。 |

## 短回答背后的解释

### 为什么 OFFSET 深分页会越来越慢

`LIMIT 20 OFFSET 100000` 的语义不是让数据库直接跳到第 100001 条，而是让数据库先按 `WHERE` 和 `ORDER BY` 找到前 100020 条记录，然后丢弃前 100000 条，只返回后面的 20 条。最终返回数据很少，但中间处理了大量不会返回给客户端的数据。如果还需要排序、回表或扫描大量索引记录，SQL 执行时间会变长，数据库连接持有时间也会变长，进一步影响连接池等待和接口 P99。

### 为什么分页排序必须稳定

分页依赖一个确定的全局顺序。如果只写 `ORDER BY created_at DESC`，而很多订单的 `created_at` 完全相同，那么这些订单之间没有唯一顺序。数据库每次执行时可以用不同的内部执行计划或排序方式返回这些相同时间的记录，导致第一页和第二页之间可能重复看到某条记录，也可能漏掉某条记录。常见做法是加一个唯一字段做 tie-breaker，例如 `ORDER BY created_at DESC, id DESC`，让每一行在排序里都有确定位置。

### 为什么 cursor 要包含所有排序字段

Cursor pagination 的本质是记录“上一页最后一条数据在排序序列里的位置”。如果排序是 `ORDER BY created_at DESC, id DESC`，这个位置就由 `created_at` 和 `id` 两个字段共同决定。只带 `created_at` 时，系统只知道上一页结束在某个时间点，但不知道这个时间点内具体结束在哪一条记录。下一页如果写 `created_at < last_created_at`，会漏掉同一时间但 id 更小的记录；如果写 `created_at <= last_created_at`，又可能重复上一页已经返回过的记录。所以 cursor 要带完整排序键。

### 为什么组合索引要匹配过滤和排序

对于 `WHERE user_id = ?` 并按 `created_at DESC, id DESC` 翻页的订单列表，合适索引是 `(user_id, created_at DESC, id DESC)`。`user_id` 是等值过滤，放在最前面可以先把扫描范围缩小到某个用户的订单；后面的 `created_at DESC, id DESC` 和排序顺序一致，数据库可以在这个用户的订单范围里按索引顺序向后扫描。配合 cursor 条件，数据库不需要从头跳过大量行，而是从上一页最后位置附近继续取，拿够 `LIMIT 20` 就可以停止。

### Cursor pagination 的代价是什么

Cursor pagination 用上一页最后一条记录的位置作为下一页查询条件，所以它天然适合“下一页”“加载更多”“无限滚动”这类连续访问。但它不天然支持直接跳到第 100 页，因为第 100 页的位置依赖前面页面的游标；没有第 99 页最后一条记录的位置，就无法直接构造第 100 页的 cursor。后台低频管理页如果必须支持跳页，可以保留 OFFSET，但要限制最大页数；或者维护页码到 cursor 的映射、使用搜索引擎/快照导出等额外方案。

### 为什么导出不要用深 OFFSET 循环

批量导出时用 `LIMIT 1000 OFFSET n` 循环，看起来每次只取 1000 条，但越往后 offset 越大，数据库每一批要扫描并丢弃的前置数据越多。导出 100 万条时，后面的批次会越来越慢，还会长时间占用数据库连接、消耗 IO 和 buffer pool，影响线上查询。更好的方式是用 cursor/keyset 分批扫描，例如按 `created_at DESC, id DESC` 或按自增主键记录上一批最后位置，下一批从这个位置继续取。

### 为什么 cursor 不建议裸露内部字段

Cursor 的本质是服务端用来继续查询的位置，但对客户端来说，它最好只是一个不透明 token。如果直接明文返回 `{created_at, id}`，客户端会看到内部排序字段、数据库主键和部分数据分布；更麻烦的是，客户端可以手动改 cursor，例如改成很早的时间或不存在的 id，制造异常查询或绕过正常翻页流程。常见做法是把 `{created_at, id}` 序列化成 JSON 后 base64 编码，再加签名或 HMAC 校验，服务端收到后先校验再解析。这样客户端能传回 cursor，但不需要理解 cursor 的内部结构，也不能随意篡改。

### 评论列表 cursor 分页怎么设计

商品评论列表按 `created_at DESC, id DESC` 排序时，下一页 cursor 要保存上一页最后一条评论的 `created_at` 和 `id`。下一页查询要过滤掉已经返回过的数据：如果创建时间更早，就一定在后面；如果创建时间相同，就继续比较 id。对应 SQL 可以写成 `created_at < last_created_at OR (created_at = last_created_at AND id < last_id)`。索引设计为 `(product_id, created_at DESC, id DESC)`，让数据库先定位到某个商品的评论范围，再沿着稳定排序顺序继续扫描。

### 如何和产品解释任意跳页的取舍

评论、消息、订单动态这类时间流列表，用户通常更关心最新内容和连续加载，而不是精确跳到很深的某一页。展示总页数通常需要额外统计总数，任意跳页又容易把系统带回深 OFFSET 查询，数据量大时会拖慢数据库和线上接口。工程上可以先确认业务价值：如果是用户端评论列表，优先用 cursor 和“加载更多”；如果是后台低频管理场景，可以保留跳页但限制最大页数，或者提供筛选条件、时间范围、搜索和导出任务来替代无限深跳页。

### Cursor 分页仍然慢时怎么查 EXPLAIN

Cursor pagination 只是避免深 OFFSET 的访问方式，不代表 SQL 一定走对索引。排查时要用 EXPLAIN 看访问路径：`type` 是否接近全表扫描，`key` 是否命中预期组合索引，`rows` 预估扫描行数是否仍然很大，`Extra` 里是否还有 `Using filesort` 或 `Using temporary`。还要回到 SQL 本身看 `WHERE` 字段和 `ORDER BY` 字段是否都被组合索引覆盖，字段顺序是否匹配“等值过滤在前、排序和游标字段在后”。如果索引是 `(created_at, id)`，但查询还有 `WHERE product_id = ?`，就可能没法先缩小商品范围；如果索引顺序和排序不一致，也可能继续 filesort。

### OFFSET 和 cursor 的适用场景

OFFSET pagination 的优点是简单，天然支持页码和跳页，所以适合数据量不大、访问频率低、后台管理页或明确需要跳到某一页的场景。但它在大 offset 下会扫描并丢弃大量前置记录，不适合高频大表列表。Cursor pagination 用上一页最后一条记录的位置继续查，适合订单列表、评论列表、消息流、Feed、无限下拉和批量导出这类连续访问场景。它的代价是不擅长任意跳页，接口和前端交互也要围绕 `next_cursor` 设计。

## 面试表达

OFFSET 深分页慢的原因不是返回 20 条慢，而是数据库为了拿到这 20 条，通常要先处理 `offset + limit` 条数据。比如 `LIMIT 20 OFFSET 100000` 可能要先找到 100020 条，再丢弃前 100000 条。页数越深，无效扫描和排序成本越高，所以高频大表列表不适合无限制使用深 OFFSET。

分页排序必须稳定。如果只按 `created_at DESC` 排序，而多个订单的创建时间相同，这些订单之间没有确定顺序，翻页时就可能出现重复或遗漏。通常会加主键作为 tie-breaker，例如 `ORDER BY created_at DESC, id DESC`，并让 cursor 也同时携带 `created_at` 和 `id`。

Cursor 必须包含所有排序字段。比如列表按 `created_at DESC, id DESC` 排序，下一页 cursor 就要带 `last_created_at` 和 `last_id`。只带时间无法精确表达上一页最后一条记录的位置，容易在相同创建时间的数据之间重复或漏数据。

订单 cursor 分页的索引要同时匹配过滤和排序。对于 `WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20`，我会建 `(user_id, created_at DESC, id DESC)`。这样数据库先定位到某个用户的订单范围，再按创建时间和 id 的倒序继续扫描，既避免 filesort，也避免深 OFFSET 的大量无效跳过。

Cursor pagination 的代价是它不擅长任意跳页。它依赖上一页最后一条记录的 cursor，所以很适合移动端列表、消息流、订单列表的“加载更多”，但不适合天然支持“跳到第 100 页”。如果后台低频场景确实需要跳页，可以保留有深度限制的 OFFSET，或者用快照、搜索系统、页码到游标映射等额外设计。

大批量导出不应该用 OFFSET 循环，因为 offset 越来越大，后续批次会越来越慢。更合理的是用 cursor 或 keyset pagination，每批记录最后一条的排序键，下一批从这个位置继续查。这样每批处理量更稳定，也能减少数据库连接被长时间占用对线上接口的影响。

Cursor 对客户端最好是不透明的。直接返回 `{created_at, id}` 虽然功能上可行，但会暴露内部字段和主键，也容易被客户端篡改。工程上通常把 cursor 编码成 token，例如 base64(JSON)，并加签名或校验；服务端解析前先验证 cursor 没被改过，再用于构造下一页查询。

对于商品评论列表，cursor 可以包含上一页最后一条评论的 `created_at` 和 `id`，索引设计为 `(product_id, created_at DESC, id DESC)`。下一页查询用 `product_id = ?` 过滤商品，再用 `created_at < last_created_at OR (created_at = last_created_at AND id < last_id)` 从上一页之后继续取，保证不会重复或漏掉同一时间的评论。

如果产品要求大表评论列表展示总页数和任意跳页，我会先解释业务和性能取舍。用户端评论通常是时间流，用户更关心最新评论和连续加载，任意跳到很深页的价值不高；但总页数和深跳页会带来 count 和深 OFFSET 成本。更合理的是用户端用 cursor 加载更多，后台低频场景限制最大跳页，并提供筛选、搜索或导出能力。

如果列表已经改成 cursor pagination 但还是慢，我会用 EXPLAIN 验证执行计划，而不是默认 cursor 写法没问题。重点看有没有全表扫描、是否命中预期组合索引、扫描行数是否仍然很大，以及是否还有 `Using filesort` 或 `Using temporary`。如果 where 字段、排序字段和组合索引顺序不匹配，cursor 也可能退化成大量扫描和排序。

OFFSET pagination 适合数据量较小、低频后台页面或者确实需要指定页码跳转的场景；cursor pagination 更适合大表、高频列表、时间流和无限下拉，比如订单列表、评论列表、消息流。选择分页方式时要结合业务交互和数据规模，而不是所有列表都统一用一种方案。

## 复盘记录

| 复盘题 | 回答 | 结果 |
| --- | --- | --- |
| 什么时候适合 OFFSET pagination，什么时候适合 cursor pagination？ | OFFSET pagination，行数比较少，需要指定页面。cursor pagination，行数很多，不需要指定页面，流式数据，无限下拉 | 通过。OFFSET 适合小数据、低频和跳页；cursor 适合大表、高频、连续加载和时间流。 |
| 为什么 cursor pagination 的排序通常用 `ORDER BY created_at DESC, id DESC`，而不是只用 `created_at DESC`？ | 因为相同时间的行会比较多，需要用 id 来保持排序稳定 | 通过。`created_at` 不唯一，相同时间的多条记录需要用唯一字段做 tie-breaker，避免翻页重复或漏数据。 |
| 如果排序是 `ORDER BY created_at DESC, id DESC`，为什么 cursor 里也必须包含 `created_at` 和 `id`？ | 因为按照 created_at 和 id 一起排序的话，created_at 和 id 就是最终的游标 | 通过。游标必须包含完整排序键，才能精确表示上一页最后一条记录的位置；只带时间会在同一时间记录之间重复或漏数据。 |
| 评论 cursor 分页 `WHERE product_id = ? ORDER BY created_at DESC, id DESC` 应该建什么组合索引？为什么？ | `index(product_id, created_at desc, id desc)`，需要覆盖 where 条件和排序条件 | 通过。`product_id` 先缩小商品评论范围，`created_at/id` 匹配排序和游标条件，避免额外排序和大量扫描。 |
| 订单列表 P99 升高，慢 SQL 是深 OFFSET 分页，怎么排查和改造？ | 可以把 offset 改造成 cursor，给表按照 where 路径和 order 路径加组合索引，然后用 explain 分析新写法的索引是否用上了，上线之后观察 P99 是否下降了 | 通过。先用慢 SQL 和 EXPLAIN 确认深分页和索引问题，再用匹配过滤/排序的组合索引和 cursor pagination 改造，上线后观察接口 P99、SQL 耗时、扫描行数和连接池等待。 |

复盘结论：已掌握分页优化的核心主线。OFFSET pagination 简单、支持跳页，适合小数据量和低频后台场景，但深 OFFSET 会扫描并丢弃大量无用数据；cursor pagination 适合大表、高频列表、时间流、无限下拉和批量导出。设计 cursor 时要保证排序稳定，例如 `created_at DESC, id DESC`，cursor 要包含所有排序字段，组合索引要匹配等值过滤、排序和游标条件。上线改造后要用 EXPLAIN 和线上指标验证：是否命中预期索引、扫描行数是否下降、是否消除 filesort，以及接口 P99、SQL P99、连接池等待是否改善。
