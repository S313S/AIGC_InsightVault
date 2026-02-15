# Cron Monitor 返回结果说明（通俗版）

适用接口：`GET /api/cron-monitor`

这份文档用来快速看懂接口返回的 JSON，尤其是：
- 本次到底抓到了多少内容
- 在哪一步被过滤掉了
- 分词搜索（split）是否真的生效
- 信任账号到底有没有被采集

---

## 1. 一眼先看这 6 个字段

| 字段 | 你可以怎么理解 |
|---|---|
| `effective.split` | 是否启用了分词搜索（`true`=按关键词分别查） |
| `platformStats[].keywordTasks` | 本次跑了多少关键词任务（Twitter split 常见是 17） |
| `funnel.fetched` | 原始抓取总数（过滤前） |
| `funnel.afterMinInteraction` | 过“互动阈值”后剩多少 |
| `funnel.afterQuality` | 过“质量关键词过滤”后剩多少 |
| `candidates` | 最终候选数（去重后，准备入库） |

---

## 2. 顶层字段（总览）

| 字段 | 说明 |
|---|---|
| `inserted` | 本次新插入到 `knowledge_cards` 的数量 |
| `updatedExisting` | 本次更新了多少已有 trending 卡片 |
| `updatedTasks` | 更新 tracking task 的数量（当前通常是 0） |
| `candidates` | 最终候选条数（经过全部过滤+去重） |
| `tasksRun` | 本次实际运行了多少任务循环 |

---

## 3. `effective`（本次实际生效的参数）

| 字段 | 说明 |
|---|---|
| `days` | 通用时间窗口（天） |
| `twitter_days` | Twitter 专用时间窗口（天） |
| `minInteraction` | 普通账号最低互动阈值（点赞+评论） |
| `trustedMinInteraction` | 信任账号最低互动阈值 |
| `qualityBypassInteraction` | 超高互动时可绕过部分质量词限制的阈值 |
| `limit` | 每次 API 调用最多返回多少条 |
| `tasks` | 任务参数值 |
| `parallel` | 是否并发请求 |
| `split` | 是否开启分词搜索 |
| `twitter_require_terms` | Twitter 查询附带的必含词 |
| `qualityPositiveCount` | 正向质量词数量 |
| `qualityBlacklistCount` | 黑名单词数量 |
| `trustedHandles` | 从数据库加载到的信任账号数量 |

---

## 4. `funnel`（过滤漏斗）

可以把它理解成“层层筛选”：

| 字段 | 说明 |
|---|---|
| `funnel.fetched` | 原始抓取数（最开始） |
| `funnel.afterMinInteraction` | 过互动量门槛后 |
| `funnel.afterRecent` | 过时效过滤后 |
| `funnel.afterAI` | 过 AI 相关性过滤后 |
| `funnel.afterQuality` | 过质量关键词过滤后 |
| `funnel.candidates` | 最终候选（去重后） |

---

## 5. 平台字段（Twitter / 小红书）

| 字段 | 说明 |
|---|---|
| `platformStats[].count` | 该平台抓取总数 |
| `platformStats[].keywordCount` | 关键词路径抓取数 |
| `platformStats[].trustedCount` | 信任账号路径抓取数 |
| `platformStats[].split` | 本次该平台是否启用 split |
| `platformStats[].keywordTasks` | 该平台本次关键词任务数 |
| `platformTotals.<platform>.fetched` | 该平台原始抓取总数 |
| `platformTotals.<platform>.output` | 该平台过滤后输出数 |
| `platformFunnel.<platform>.*` | 该平台每一层漏斗数据 |

---

## 6. 调试字段（排查很有用）

| 字段 | 说明 |
|---|---|
| `twitterSamples` | Twitter 抓取样本（仅样本，不是全量） |
| `engagementDebug` | 互动阈值判定样本（仅样本，不是全量） |
| `platformErrors` | 平台错误列表（空数组表示这次没报错） |
| `generatedCoverCount` | 本次自动生成封面的数量 |

---

## 7. 信任账号“看起来没采集”的常见原因

先看这两个字段：

1. `effective.trustedHandles`：大于 0 说明 DB 已成功读取信任账号配置。  
2. `platformStats[].trustedCount`：大于 0 说明信任账号查询确实抓到了数据。

如果这两个都正常，但你“感觉没看到”，通常是：
- 你看的只是 `twitterSamples` / `engagementDebug` 样本，不是全量；
- 抓到后还要继续过 recent / AI / quality / dedup 过滤，最终可能被筛掉；
- `trustedMinInteraction` 可能设置得比普通账号更高，导致通过率低。

---

## 8. 快速自检（推荐）

用同一组参数跑两次做对照：

1. `split=0`（关闭分词）  
2. `split=1`（开启分词）

重点比较：
- `effective.split`
- `platformStats[].keywordTasks`
- `funnel.fetched`
- `candidates`

通常 `split=1` 时，`fetched` 会更高，覆盖更完整。
