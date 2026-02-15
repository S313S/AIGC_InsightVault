# Twitter Split Keyword Search — Implementation Guide

# Twitter 分词搜索 — 实现指南

---

## 1. Problem Description / 问题描述

### Current Behavior / 当前行为

The cron monitor combines ALL keywords into a single Twitter API query using `OR`:

当前 cron monitor 将所有关键词用 `OR` 合并为一条 Twitter API 查询：

```
("AI" OR "AIGC" OR "人工智能" OR ... OR "AI编程") ("Claude" OR "GPT" OR "LLM" OR ...) has:media -is:retweet -is:reply
```

With `max_results` capped at 100, this single query only returns **at most 100 tweets** for ALL keywords combined, and there is **no pagination** (`next_token` is never followed). This causes significant data loss — many relevant tweets that can be found via manual Twitter search are missed.

由于 `max_results` 最多为 100，这条合并查询**最多只返回 100 条推文**，且**没有分页**（从未使用 `next_token`）。这导致大量数据遗漏——手动在 Twitter 搜索能找到的推文被漏掉了。

### Root Cause / 根本原因

In `api/cron-monitor.js`:

- **Line 676**: `twitterKeywordPool = DEFAULT_MONITOR_KEYWORDS.slice(0, effectiveMaxTasks)` — keywords are sliced by `MAX_TASKS_PER_RUN` (default 3), so only the first N keywords are used.
- **Line 722**: `searchTwitter(twitterKeywordPool, effectiveLimit, ...)` — all selected keywords are sent as one combined query.
- **Line 418**: `max_results = Math.min(Math.max(limit, 10), 100)` — API hard cap is 100 results per call.
- **Line 715-716**: `twitterQueried` flag ensures Twitter is only queried **once** across all task iterations.

在 `api/cron-monitor.js` 中：

- **第 676 行**：`twitterKeywordPool` 被 `MAX_TASKS_PER_RUN`（默认 3）截断，只使用前 N 个关键词。
- **第 722 行**：所有选中的关键词合并为一条查询发送。
- **第 418 行**：API 硬性上限为每次调用 100 条结果。
- **第 715-716 行**：`twitterQueried` 标志确保 Twitter 在所有任务迭代中**只查询一次**。

---

## 2. Solution Design / 方案设计

### Approach: Optional Split Mode / 方案：可选的分词模式

Add a **`split` mode** as an optional parameter. When enabled, each keyword gets its own independent API query. The default behavior (combined single query) remains unchanged.

添加一个可选的 **`split` 模式**参数。启用后，每个关键词独立发起一次 API 查询。默认行为（合并单查询）保持不变。

| Mode / 模式 | Trigger / 触发方式 | Behavior / 行为 |
|---|---|---|
| **Default (combined)** | `split` not set or `split=0` | All keywords → 1 API call, fast & safe / 所有关键词 → 1 次 API 调用，快速稳定 |
| **Split (per-keyword)** | `split=1` via URL param or Settings UI toggle | Each keyword → 1 API call, `limit` applies per keyword / 每个关键词 → 1 次 API 调用，`limit` 作用于每个关键词 |

### Split Mode Behavior / 分词模式行为

When `split=1`:
- Each of the 17 `DEFAULT_MONITOR_KEYWORDS` gets its own Twitter API call
- Each call uses `max_results = limit` (e.g., `limit=30` → each keyword fetches up to 30 tweets)
- Total raw tweets: up to `17 × 30 = 510` (before dedup & filtering)
- All results are merged into the same pool, then pass through the **same** dedup + filter pipeline (minInteraction → recent → AI → quality)
- Trusted account query remains a separate single query (unchanged)

当 `split=1` 时：
- 17 个 `DEFAULT_MONITOR_KEYWORDS` 中的每个关键词独立发起一次 Twitter API 调用
- 每次调用使用 `max_results = limit`（例如 `limit=30` → 每个关键词最多获取 30 条推文）
- 原始推文总数：最多 `17 × 30 = 510`（去重和过滤前）
- 所有结果合并到同一个池中，然后通过**相同的**去重 + 过滤管道（minInteraction → recent → AI → quality）
- 信任账号查询仍然是单独的一次查询（不变）

---

## 3. Changes Required / 需要修改的内容

### 3.1 Backend: `api/cron-monitor.js`

#### 3.1.1 Read `split` parameter from URL query string / 从 URL 查询参数中读取 `split`

In the section where other override parameters are parsed (around line 500-535), add:

在解析其他覆盖参数的位置（约第 500-535 行），添加：

```javascript
const overrideSplit = searchParams.get('split');
const effectiveSplit = overrideSplit === '1' || overrideSplit === 'true';
```

#### 3.1.2 Also read `split` from `monitor_settings` DB table / 同时从 `monitor_settings` 数据库表中读取 `split`

If the URL param is not provided, fall back to the database setting:

如果 URL 参数未提供，则回退到数据库设置：

```javascript
// After loading settings from monitor_settings table
const dbSplit = settings.find(s => s.key === 'twitter_split_keywords');
const effectiveSplit = overrideSplit === '1' || overrideSplit === 'true'
  || (!overrideSplit && dbSplit?.value === 'true');
```

#### 3.1.3 Modify Twitter search logic (around lines 706-730) / 修改 Twitter 搜索逻辑（约第 706-730 行）

Replace the current single-query Twitter search with conditional logic:

将当前的单查询 Twitter 搜索替换为条件逻辑：

```
IF effectiveSplit is true:
  - Use ALL 17 DEFAULT_MONITOR_KEYWORDS (ignore MAX_TASKS_PER_RUN slicing for Twitter)
  - Loop through each keyword individually:
    - For each keyword, call searchTwitter([keyword], effectiveLimit, bearerToken, twitterQueryOpts)
    - Collect all results into the shared allResults pool
    - Update platformFunnel.twitter.fetched accordingly
  - If parallel=true, use Promise.all to run keyword queries concurrently
  - If parallel=false, run sequentially with optional small delay between calls
ELSE (default, current behavior):
  - Keep existing combined query logic unchanged
  - twitterKeywordPool = DEFAULT_MONITOR_KEYWORDS.slice(0, effectiveMaxTasks)
  - Single searchTwitter(twitterKeywordPool, effectiveLimit, ...) call
```

**Important**: The `twitterQueried` flag logic, trusted account query, and the entire downstream filtering pipeline (minInteraction → recent → AI → quality → dedup) should remain **completely unchanged**.

**重要**：`twitterQueried` 标志逻辑、信任账号查询以及整个下游过滤管道（minInteraction → recent → AI → quality → dedup）应**完全保持不变**。

#### 3.1.4 Include `split` in the response `effective` object / 在响应的 `effective` 对象中包含 `split`

Add `split: effectiveSplit` to the `effective` section of the JSON response, so the UI and debugging can see whether split mode was active:

在 JSON 响应的 `effective` 部分添加 `split: effectiveSplit`，以便 UI 和调试可以看到分词模式是否激活：

```javascript
effective: {
  // ... existing fields ...
  split: effectiveSplit,
}
```

---

### 3.2 Database: `monitor_settings` table

Add a new row to the `monitor_settings` table to persist the split toggle:

在 `monitor_settings` 表中添加新行以持久化分词开关：

| key | value | description |
|---|---|---|
| `twitter_split_keywords` | `"false"` (default) | When "true", each keyword queries Twitter API independently / 为 "true" 时，每个关键词独立查询 Twitter API |

---

### 3.3 Frontend: `services/supabaseService.ts`

Add functions to read and update the `twitter_split_keywords` setting (or reuse the existing `getMonitorSettings` / `updateMonitorSetting` functions if they already support arbitrary key-value pairs).

添加读取和更新 `twitter_split_keywords` 设置的函数（或复用现有的 `getMonitorSettings` / `updateMonitorSetting` 函数，如果它们已支持任意键值对）。

---

### 3.4 Frontend: `types.ts`

Extend the `MonitorSettings` type to include the split toggle:

扩展 `MonitorSettings` 类型以包含分词开关：

```typescript
interface MonitorSettings {
  minEngagement: number;
  trustedMinEngagement: number;
  twitterSplitKeywords: boolean;  // NEW
}
```

---

### 3.5 Frontend: `components/SettingsModal.tsx`

#### Add to the "互动阈值 (Engagement Thresholds)" tab / 添加到"互动阈值"标签页

Add a new toggle switch in the **Engagement Thresholds tab** (Tab 3), below the existing threshold inputs:

在**互动阈值标签页**（第 3 个标签页）中，现有阈值输入框下方添加一个新的开关：

**UI Layout / UI 布局：**

```
┌─────────────────────────────────────────────────┐
│  互动阈值 / Engagement Thresholds               │
│                                                   │
│  最低互动量 (likes + comments)                     │
│  ┌──────────────┐                                 │
│  │     500      │                                 │
│  └──────────────┘                                 │
│                                                   │
│  信任账号最低互动量                                  │
│  ┌──────────────┐                                 │
│  │    1000      │                                 │
│  └──────────────┘                                 │
│                                                   │
│  ─────────────── NEW SECTION BELOW ──────────────│
│                                                   │
│  Twitter 分词搜索 / Split Keyword Search          │
│  ┌─────┐                                          │
│  │ OFF │  ← Toggle Switch                         │
│  └─────┘                                          │
│  启用后，每个关键词独立查询 Twitter API，              │
│  获取更全面的数据，但会消耗更多 API 配额。              │
│  When enabled, each keyword queries Twitter API    │
│  independently for broader coverage, but uses      │
│  more API quota.                                   │
│                                                   │
└─────────────────────────────────────────────────┘
```

**Behavior / 行为：**
- Toggle defaults to OFF (matches current default behavior)
- When toggled, call `updateMonitorSetting('twitter_split_keywords', value ? 'true' : 'false')`
- Load initial state from `getMonitorSettings()` on modal open

- 开关默认为 OFF（匹配当前默认行为）
- 切换时调用 `updateMonitorSetting('twitter_split_keywords', value ? 'true' : 'false')`
- 模态框打开时从 `getMonitorSettings()` 加载初始状态

---

## 4. File Change Summary / 文件修改总结

| File / 文件 | Change / 修改 |
|---|---|
| `api/cron-monitor.js` | Read `split` param; add split-mode search loop; include `split` in response `effective` object |
| `services/supabaseService.ts` | Support reading/writing `twitter_split_keywords` from `monitor_settings` table |
| `types.ts` | Add `twitterSplitKeywords: boolean` to `MonitorSettings` |
| `components/SettingsModal.tsx` | Add toggle switch UI in Engagement Thresholds tab |
| DB: `monitor_settings` | Insert row: `key='twitter_split_keywords'`, `value='false'` |

---

## 5. API Parameter Reference / API 参数参考

After implementation, the cron-monitor endpoint supports:

实现后，cron-monitor 端点支持：

```
GET /api/cron-monitor?platform=twitter&split=1&limit=30&tasks=15&parallel=1
```

| Param | Type | Default | Description |
|---|---|---|---|
| `split` | `0` or `1` | `0` | Enable per-keyword split search / 启用分词搜索 |
| `limit` | number | `10` | Max results per API call (applies per keyword in split mode) / 每次 API 调用最大结果数 |
| `tasks` | number | `3` | Max keyword tasks per run (only affects combined mode) / 每次运行最大关键词任务数（仅影响合并模式） |
| `parallel` | `0` or `1` | `0` | Run queries concurrently / 并发运行查询 |

**Example with split mode / 分词模式示例：**
```
/api/cron-monitor?platform=twitter&split=1&limit=30&parallel=1

→ 17 keywords × 30 max_results = up to 510 raw tweets
→ Same dedup + filter pipeline applies
→ More comprehensive coverage at the cost of 17 API calls
```

---

## 6. Important Notes / 注意事项

1. **Rate Limiting / 速率限制**: Split mode makes 17+ API calls per run (17 keywords + 1 trusted accounts). Twitter Basic API tier allows 60 requests per 15 minutes for `tweets/search/recent`. Monitor usage carefully.
   分词模式每次运行发起 17+ 次 API 调用。Twitter Basic API 层级允许每 15 分钟 60 次 `tweets/search/recent` 请求。请注意监控用量。

2. **Timeout Risk / 超时风险**: With `parallel=1`, concurrent requests mitigate timeout risk. Without parallel mode, 17 sequential requests may approach Vercel's function timeout limit. Consider always using `parallel=1` with split mode.
   使用 `parallel=1` 时，并发请求可减轻超时风险。无并行模式时，17 次顺序请求可能接近 Vercel 函数超时限制。建议分词模式始终搭配 `parallel=1`。

3. **Default Behavior Unchanged / 默认行为不变**: Without `split=1` parameter and without the toggle enabled in settings, the system behaves exactly as before — single combined query, fast and stable.
   未设置 `split=1` 参数且设置中未启用开关时，系统行为与之前完全一致——单条合并查询，快速稳定。

4. **Dedup Pipeline Unchanged / 去重管道不变**: The entire downstream filtering pipeline (minInteraction → recent → AI relevance → quality keywords → URL dedup) remains identical in both modes. Only the raw tweet fetching strategy changes.
   整个下游过滤管道（minInteraction → recent → AI 相关性 → 质量关键词 → URL 去重）在两种模式下完全相同。仅原始推文获取策略不同。

---

## 7. Response Field Reference / 响应字段说明

Use this section to quickly interpret `GET /api/cron-monitor` JSON results.

用本节快速理解 `GET /api/cron-monitor` 的返回 JSON。

### 7.1 Top-Level Summary Fields / 顶层汇总字段

| Field | Meaning (EN) | 含义（中文） |
|---|---|---|
| `inserted` | Number of newly inserted trending rows in `knowledge_cards` | 本次新插入到 `knowledge_cards`（trending）的记录数 |
| `updatedExisting` | Number of existing trending rows updated/rolled forward | 本次被更新（滚动刷新）的已有 trending 记录数 |
| `updatedTasks` | Number of tracking tasks updated | 本次更新的 tracking task 数量（当前实现通常为 0） |
| `candidates` | Final number of candidates after all filters and dedup | 完整过滤和去重后最终候选数 |
| `tasksRun` | Number of task loops executed | 本次实际执行的任务循环数 |

### 7.2 `effective` / 生效参数

| Field | Meaning (EN) | 含义（中文） |
|---|---|---|
| `days` | Effective general recency window (days) | 通用内容的时间窗口（天） |
| `twitter_days` | Effective Twitter recency window (days) | Twitter 专用时间窗口（天） |
| `minInteraction` | Interaction threshold for normal accounts | 普通账号互动阈值（点赞+评论） |
| `trustedMinInteraction` | Interaction threshold for trusted accounts | 信任账号互动阈值（点赞+评论） |
| `qualityBypassInteraction` | High-engagement bypass threshold for quality keyword gate | 超高互动内容绕过质量词限制的阈值 |
| `limit` | Max results per Twitter API call | 每次 Twitter API 调用最大返回数 |
| `tasks` | Effective `tasks` param | 生效的 `tasks` 参数 |
| `parallel` | Whether platform/keyword queries run concurrently | 是否并发执行查询 |
| `split` | Whether per-keyword split mode is enabled | 是否启用分词模式（按关键词独立查询） |
| `twitter_require_terms` | Required query terms appended to Twitter search | Twitter 查询中附加的必含词 |
| `qualityPositiveCount` | Count of positive quality keywords in DB | 正向质量关键词数量 |
| `qualityBlacklistCount` | Count of blacklist quality keywords in DB | 黑名单质量关键词数量 |
| `trustedHandles` | Count of trusted Twitter accounts loaded from DB | 从 DB 加载到的信任 Twitter 账号数量 |

### 7.3 Funnel Fields / 漏斗字段

| Field | Meaning (EN) | 含义（中文） |
|---|---|---|
| `funnel.fetched` | Raw fetched item count before filtering | 过滤前原始抓取总数 |
| `funnel.afterMinInteraction` | Remaining after interaction threshold | 互动阈值过滤后剩余数 |
| `funnel.afterRecent` | Remaining after recency filter | 时效过滤后剩余数 |
| `funnel.afterAI` | Remaining after AI relevance filter | AI 相关性过滤后剩余数 |
| `funnel.afterQuality` | Remaining after quality-keyword filter | 质量关键词过滤后剩余数 |
| `funnel.candidates` | Final candidates after dedup | 最终候选（去重后） |

### 7.4 Platform-Level Fields / 平台级字段

| Field | Meaning (EN) | 含义（中文） |
|---|---|---|
| `platformStats[].count` | Total fetched items for the platform | 该平台总抓取数 |
| `platformStats[].keywordCount` | Count fetched via keyword query path | 关键词查询路径抓取数 |
| `platformStats[].trustedCount` | Count fetched via trusted-account query path | 信任账号查询路径抓取数 |
| `platformStats[].split` | Whether split mode was active for this run | 本次该平台是否启用 split |
| `platformStats[].keywordTasks` | Number of keyword tasks used by Twitter fetch | Twitter 抓取使用的关键词任务数 |
| `platformTotals.*.fetched` | Platform fetched total (same stage as funnel fetched) | 平台抓取总数（同漏斗 fetched 阶段） |
| `platformTotals.*.output` | Platform output count after quality stage | 平台在质量过滤后的输出数 |
| `platformFunnel.*` | Per-platform funnel counters by stage | 各平台分阶段漏斗统计 |

### 7.5 Debug/Diagnostics Fields / 调试字段

| Field | Meaning (EN) | 含义（中文） |
|---|---|---|
| `twitterSamples` | Small sample of fetched Twitter items for spot-checking | Twitter 抓取样本（用于快速抽查） |
| `generatedCoverCount` | Number of cover images generated this run | 本次自动生成封面数量 |
| `engagementDebug` | Sample-level interaction-threshold decisions | 互动阈值判定样本（不是全量） |
| `platformErrors` | Platform-level errors collected during this run | 本次运行中的平台错误列表 |

### 7.6 Trusted Accounts FAQ / 信任账号常见疑问

**Q: Why does it look like trusted accounts were not collected?**

**问：为什么看起来像没有采集到信任账号？**

Check these fields first:

先看以下字段：

1. `effective.trustedHandles` > 0 means trusted handles were loaded from DB.
2. `platformStats[].trustedCount` > 0 means trusted-account query fetched data successfully.
3. `engagementDebug` is only a sample, not the full set.
4. Trusted items still go through downstream filters (recent/AI/quality/dedup), so fetched != final output.

1. `effective.trustedHandles` > 0 表示已从 DB 读到信任账号配置。
2. `platformStats[].trustedCount` > 0 表示信任账号查询确实抓到了数据。
3. `engagementDebug` 只是样本，不是全量。
4. 信任账号内容仍需经过后续过滤（时效/AI/质量/去重），因此“抓到”不等于“最终输出”。
