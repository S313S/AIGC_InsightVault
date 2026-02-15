# Twitter Content Quality Filter - Implementation Specification

---

## Background & Problem

The current cron monitoring system (`api/cron-monitor.js`) has two critical issues:

1. **Engagement threshold not enforced**: Posts with interactions far below the configured 5,000 minimum are still appearing in "近期热点" (e.g., posts with 69, 247, 184 interactions).
2. **No content quality filtering**: Even posts that pass the engagement threshold are often irrelevant — generic news, emotional commentary, or marketing content rather than practical/insightful/innovative content.

### What the user actually wants to see:
- Practical tutorials / workflows / resource collections
- New tool releases or major feature updates
- In-depth insights from specific thought leaders
- Innovative ways to use AI tools

All within the three domain categories: **Image Gen, Video Gen, Vibe Coding**.

---

## Architecture Overview

```
Data Sources (COLLECTION):
  Source A: Keyword Search (existing) → Twitter API search by AI keywords
  Source B: Trusted Account Feed (NEW) → Fetch latest posts from whitelisted accounts

         ↓ Both sources merge into the same pool ↓

Quality Filter Pipeline (FILTERING):
  Layer 1: Keyword Quality Filter (NEW)
    → Positive signal keywords boost/require relevance
    → Blacklist keywords filter OUT noise

  Layer 2: Engagement Filter (FIX + ENHANCE)
    → likes + comments ≥ configurable threshold (default: 500)
    → Fix the current bug where sub-threshold posts slip through

  Exception Rule:
    → Posts from Trusted Accounts skip Layer 2 (no engagement minimum)
    → But still pass through Layer 1 (quality signal check)

All configuration is managed via a new Settings UI + Supabase tables.
```

---

## Changes Required

---

### Change 1: New Supabase Tables

Create 3 new tables in Supabase:

#### Table: `trusted_accounts`

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | Primary key |
| `platform` | `text` | `'twitter'` | Platform identifier |
| `handle` | `text` | NOT NULL | Twitter handle without @ (e.g., `bcherny`) |
| `category` | `text` | NOT NULL | One of: `image_gen`, `video_gen`, `vibe_coding` |
| `notes` | `text` | `''` | Optional description (e.g., "Claude Code creator") |
| `created_at` | `timestamptz` | `now()` | Creation time |

Unique constraint on `(platform, handle)`.

#### Table: `quality_keywords`

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | Primary key |
| `keyword` | `text` | NOT NULL | The keyword text |
| `type` | `text` | NOT NULL | `positive` or `blacklist` |
| `created_at` | `timestamptz` | `now()` | Creation time |

Unique constraint on `(keyword, type)`.

**Preset positive keywords (seed data):**
```
English: tutorial, workflow, tips, how to, step by step, guide, setup, build,
         prompt engineering, use case, demo, walkthrough, comparison, review,
         best practices, toolchain, deep dive
Chinese: 教程, 实操, 工作流, 技巧, 分享, 经验, 玩法, 用法, 攻略, 测评,
         对比, 上手, 指南, 保姆级, 干货, 实战, 案例
```

**Preset blacklist keywords (seed data):**
```
English: hiring, giveaway, breaking news, subscribe, follow me,
         sponsored, ad, promotion, discount, coupon
Chinese: 招聘, 抽奖, 转发抽, 广告, 优惠, 打折, 求职, 招人
```

#### Table: `monitor_settings`

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | Primary key |
| `key` | `text` | NOT NULL, UNIQUE | Setting key |
| `value` | `text` | NOT NULL | Setting value (stored as string) |
| `updated_at` | `timestamptz` | `now()` | Last update time |

Initial rows:
```
{ key: 'min_engagement', value: '500' }
```

---

### Change 2: New TypeScript Types

**File: `types.ts`** — Add the following interfaces:

```typescript
interface TrustedAccount {
  id: string;
  platform: string;        // 'twitter' | 'xiaohongshu'
  handle: string;          // without @
  category: string;        // 'image_gen' | 'video_gen' | 'vibe_coding'
  notes: string;           // optional description
  createdAt?: string;
}

interface QualityKeyword {
  id: string;
  keyword: string;
  type: 'positive' | 'blacklist';
  createdAt?: string;
}

interface MonitorSettings {
  minEngagement: number;   // likes + comments threshold
}
```

---

### Change 3: Supabase Service Layer

**File: `services/supabaseService.ts`** — Add CRUD functions:

```typescript
// ===== Trusted Accounts =====
getTrustedAccounts(): Promise<TrustedAccount[]>
  // SELECT * FROM trusted_accounts ORDER BY created_at DESC

saveTrustedAccount(account: Omit<TrustedAccount, 'id' | 'createdAt'>): Promise<TrustedAccount>
  // INSERT INTO trusted_accounts (platform, handle, category, notes)

updateTrustedAccount(account: TrustedAccount): Promise<void>
  // UPDATE trusted_accounts SET handle, category, notes WHERE id

deleteTrustedAccount(id: string): Promise<void>
  // DELETE FROM trusted_accounts WHERE id

// ===== Quality Keywords =====
getQualityKeywords(): Promise<QualityKeyword[]>
  // SELECT * FROM quality_keywords ORDER BY type, created_at DESC

saveQualityKeyword(keyword: Omit<QualityKeyword, 'id' | 'createdAt'>): Promise<QualityKeyword>
  // INSERT INTO quality_keywords (keyword, type)

deleteQualityKeyword(id: string): Promise<void>
  // DELETE FROM quality_keywords WHERE id

// ===== Monitor Settings =====
getMonitorSettings(): Promise<MonitorSettings>
  // SELECT * FROM monitor_settings
  // Parse key-value pairs into MonitorSettings object
  // Return default { minEngagement: 500 } if table empty

updateMonitorSetting(key: string, value: string): Promise<void>
  // UPSERT INTO monitor_settings (key, value, updated_at)
```

---

### Change 4: Settings UI Component

**File: `components/SettingsModal.tsx`** — Rewrite the existing stub completely.

#### 4a: Settings Gear Icon in Sidebar

**File: `App.tsx`** — In the bottom section of the sidebar (next to the "XiaoCi 专业版" user profile area), add a `Settings` (gear) icon button from lucide-react.

Location: Inside the `<div className="p-4 border-t border-[#1e3a5f]/30 ...">` block, add a gear icon to the right side of the user profile row.

```tsx
// Add to App.tsx state
const [showSettings, setShowSettings] = useState(false);

// In sidebar bottom section, modify the user profile row:
<div className="flex items-center gap-3 px-2 py-2 ...">
  {/* Existing avatar + name */}
  <div>X</div>
  <div>XiaoCi / 专业版</div>

  {/* NEW: Settings gear icon */}
  <button onClick={() => setShowSettings(true)}>
    <Settings size={18} className="text-gray-400 hover:text-gray-200" />
  </button>
</div>

// Render modal
{showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
```

#### 4b: Settings Modal Layout

The modal should have **4 tab sections**, styled consistently with the existing dark theme (`bg-[#0a1628]`, etc.):

**Tab 1: Trusted Accounts (信任账号)**
- Table/list displaying all trusted accounts
- Each row shows: handle, category badge, notes, delete button
- "Add Account" form at top with:
  - Platform selector (Twitter / Xiaohongshu) — default Twitter
  - Handle input (text field, placeholder: `@username`)
  - Category selector (dropdown: Image Gen / Video Gen / Vibe Coding)
  - Notes input (text field, optional, placeholder: e.g., "Claude Code creator")
  - Add button
- Inline editing: click on a row to edit category/notes
- Delete with confirmation

**Tab 2: Quality Signal Keywords (质量信号关键词)**
- Two sections side by side (or stacked):
  - **Positive Keywords (正向关键词)**: green tag chips, each with × to delete
  - **Blacklist Keywords (屏蔽关键词)**: red tag chips, each with × to delete
- Add keyword input + type selector + add button at top of each section
- Preset keywords are pre-populated on first load (from DB seed data)

**Tab 3: Engagement Threshold (互动量阈值)**
- Single numeric input field
- Label: "Minimum engagement (likes + comments)" / "最低互动量（点赞 + 评论）"
- Current value displayed, with save button
- Helper text: "Posts from trusted accounts are exempt from this threshold" / "信任账号的帖子不受此阈值限制"

**Tab 4: About (关于)** — optional, low priority, can show version info

---

### Change 5: Fix Engagement Threshold Bug

**File: `api/cron-monitor.js`**

The current engagement threshold `DEFAULT_MIN_INTERACTION = 5000` appears to not be working correctly. Investigation and fix needed:

#### 5a: Read threshold from Supabase instead of hardcoded constant

Replace the hardcoded constant:
```javascript
// BEFORE:
const DEFAULT_MIN_INTERACTION = 5000;

// AFTER: Fetch from Supabase at runtime
const { data: settingsRows } = await supabase
  .from('monitor_settings')
  .select('key, value')
  .eq('key', 'min_engagement');

const MIN_INTERACTION = settingsRows?.[0]?.value
  ? Number(settingsRows[0].value)
  : 500;  // new default: 500
```

#### 5b: Change engagement calculation to likes + comments only

Per user requirement, engagement = likes + comments (not the full sum of all 5 metrics):

```javascript
// BEFORE:
const computeInteraction = (item) => {
  // ... sums likes + replies + retweets + quotes + bookmarks
};

// AFTER:
const computeInteraction = (item) => {
  if (!item) return 0;
  if (item.platform === 'Twitter') {
    const raw = item.metricsRaw || {};
    const likes   = raw.like_count   ?? item.metrics?.likes    ?? 0;
    const comments = raw.reply_count ?? item.metrics?.comments ?? 0;
    return likes + comments;
  }
  return (item.metrics?.likes || 0) + (item.metrics?.comments || 0);
};
```

#### 5c: Debug why sub-threshold posts appear

Investigate and fix the root cause. Possible issues:
- The `effectiveMinInteraction` override via `?min=N` query param may be set to 0
- The metrics data (`metricsRaw` / `metrics`) may be empty/null at fetch time, causing `computeInteraction` to return 0, and the comparison `0 >= 5000` should fail... unless there's a code path that skips the filter
- The XHS proxy API or Twitter API may return metrics as strings instead of numbers
- Check if there's a separate code path for manual search (`api/search-social.js`) that bypasses the engagement filter entirely — if so, the "近期热点" view may be mixing results from both cron and manual search

**Action:** Add console.log/logging to trace the exact engagement values and filter decisions during cron runs. Then fix the root cause.

---

### Change 6: Trusted Account Data Source

**File: `api/cron-monitor.js`**

Add a new data collection step that fetches recent tweets from trusted accounts.

#### 6a: Fetch trusted account list from Supabase

```javascript
const { data: trustedAccounts } = await supabase
  .from('trusted_accounts')
  .select('*')
  .eq('platform', 'twitter');
```

#### 6b: Fetch tweets from trusted accounts via Twitter API

For each trusted account, use the Twitter API v2 user timeline endpoint:
- First resolve handle → user_id via `GET /2/users/by/username/:username`
- Then fetch recent tweets via `GET /2/users/:id/tweets`
  - Parameters: `max_results=10`, `tweet.fields=created_at,public_metrics`, expansions, etc.
  - Same media/user expansions as existing search queries

OR (simpler approach): Add trusted account handles to the search query using `from:` operator:
```javascript
// Build additional query for trusted accounts
const trustedHandles = trustedAccounts.map(a => `from:${a.handle}`);
const trustedQuery = `(${trustedHandles.join(' OR ')}) -is:retweet`;
// Execute as a separate search query
```

#### 6c: Mark trusted account posts

Add a flag to results from trusted accounts so they can skip the engagement filter:

```javascript
results.forEach(r => {
  if (trustedHandleSet.has(r.author?.toLowerCase())) {
    r._fromTrustedAccount = true;
  }
});
```

#### 6d: Modify the filter pipeline

```javascript
// Engagement filter: skip for trusted accounts
results = results.filter(r =>
  r._fromTrustedAccount || computeInteraction(r) >= MIN_INTERACTION
);

// Quality keyword filter (NEW - applied to ALL posts including trusted)
results = results.filter(r => passesQualityFilter(r, positiveKeywords, blacklistKeywords));
```

---

### Change 7: Quality Keyword Filter Logic

**File: `api/cron-monitor.js`** — Add new function:

```javascript
/**
 * Quality keyword filter
 * - If post contains ANY blacklist keyword → REJECT
 * - If post contains ANY positive signal keyword → PASS
 * - If post is from a trusted account → PASS (even without positive keywords)
 * - Otherwise → REJECT
 */
const passesQualityFilter = (item, positiveKeywords, blacklistKeywords) => {
  const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();

  // Blacklist check: reject if ANY blacklist keyword found
  const isBlacklisted = blacklistKeywords.some(kw => text.includes(kw.toLowerCase()));
  if (isBlacklisted) return false;

  // Trusted account bypass (still filtered by blacklist above)
  if (item._fromTrustedAccount) return true;

  // Positive keyword check: require at least one positive signal
  const hasPositiveSignal = positiveKeywords.some(kw => text.includes(kw.toLowerCase()));
  return hasPositiveSignal;
};
```

Fetch keywords from Supabase at the start of the cron handler:

```javascript
const { data: keywordRows } = await supabase
  .from('quality_keywords')
  .select('keyword, type');

const positiveKeywords = keywordRows?.filter(k => k.type === 'positive').map(k => k.keyword) || [];
const blacklistKeywords = keywordRows?.filter(k => k.type === 'blacklist').map(k => k.keyword) || [];
```

---

### Change 8: Update the Existing `isAIRelevant` Filter

The existing `isAIRelevant()` function (checking against `AI_KEYWORDS` array) should remain as-is. The new quality keyword filter is an **additional** layer, not a replacement. The pipeline order becomes:

```
1. Fetch from APIs (keyword search + trusted accounts)
2. Engagement filter (likes + comments ≥ threshold, skip for trusted accounts)
3. Recency filter (within 7 days for Twitter)
4. AI relevance filter (existing isAIRelevant — domain check)
5. Quality keyword filter (NEW — content quality check)
6. Dedup by sourceUrl
7. Save to Supabase
```

---

## Files to Modify (Summary)

| File | Changes |
|---|---|
| **Supabase Dashboard** | Create 3 new tables: `trusted_accounts`, `quality_keywords`, `monitor_settings`. Seed preset data. |
| `types.ts` | Add `TrustedAccount`, `QualityKeyword`, `MonitorSettings` interfaces |
| `services/supabaseService.ts` | Add CRUD functions for 3 new tables |
| `components/SettingsModal.tsx` | Full rewrite: 3-tab settings UI (Trusted Accounts, Quality Keywords, Engagement Threshold) |
| `components/Icons.tsx` | Ensure `Settings` icon is exported (may already be) |
| `App.tsx` | Add settings gear icon in sidebar bottom section + state management + modal rendering |
| `api/cron-monitor.js` | Fix engagement bug; read config from Supabase; add trusted account fetching; add quality keyword filter; change engagement formula to likes+comments only |

---

## UI Design Notes

- Match existing dark theme: `bg-[#0a1628]`, `border-[#1e3a5f]`, text colors `gray-100/400/500`
- Modal should be large enough for comfortable management (e.g., `max-w-2xl` or `max-w-3xl`)
- Category badges use existing color scheme: Image Gen (purple), Video Gen (blue), Vibe Coding (green) — or match existing tag colors in the app
- Settings gear icon: subtle gray, brightens on hover, positioned at the right edge of the user profile row

---
---
---

# Twitter 内容质量过滤器 — 实施规范

---

## 背景与问题

当前的定时监控系统 (`api/cron-monitor.js`) 存在两个关键问题:

1. **互动量阈值未生效**: 远低于配置的 5,000 最低互动量的帖子仍然出现在"近期热点"中（如互动量仅 69、247、184 的帖子）。
2. **无内容质量过滤**: 即使通过了互动量阈值的帖子也常常不相关——大多是泛泛的新闻、情绪化评论或营销内容，而非有实操价值/深度见解/创新用法的内容。

### 用户真正想看到的内容:
- 实操教程 / 工作流 / 推荐资源合集
- 新工具发布或重大功能更新
- 特定思想领袖的深度见解
- 工具的创新用法

所有内容都必须在三大领域分类内: **AI绘画(Image Gen)、AI视频(Video Gen)、Vibe Coding**。

---

## 架构总览

```
数据源（采集层）:
  来源 A: 关键词搜索（现有）→ 通过 AI 关键词搜索 Twitter API
  来源 B: 信任账号动态（新增）→ 获取白名单账号的最新帖子

         ↓ 两个来源合并到同一个数据池 ↓

质量过滤管道（过滤层）:
  第一层: 关键词质量过滤（新增）
    → 正向信号关键词提升/要求相关性
    → 屏蔽关键词过滤掉噪音

  第二层: 互动量过滤（修复 + 增强）
    → 点赞 + 评论 ≥ 可配置阈值（默认: 500）
    → 修复当前低于阈值的帖子仍然出现的 Bug

  例外规则:
    → 信任账号的帖子跳过第二层（无互动量要求）
    → 但仍需通过第一层（质量信号检查）

所有配置通过新的设置界面 + Supabase 表管理。
```

---

## 需要的变更

---

### 变更 1: 新建 Supabase 数据表

在 Supabase 中创建 3 张新表:

#### 表: `trusted_accounts` (信任账号)

| 列名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | 主键 |
| `platform` | `text` | `'twitter'` | 平台标识 |
| `handle` | `text` | NOT NULL | Twitter 用户名，不含 @（如 `bcherny`）|
| `category` | `text` | NOT NULL | 取值: `image_gen`, `video_gen`, `vibe_coding` |
| `notes` | `text` | `''` | 可选备注（如"Claude Code 创造者"）|
| `created_at` | `timestamptz` | `now()` | 创建时间 |

唯一约束: `(platform, handle)`。

#### 表: `quality_keywords` (质量关键词)

| 列名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | 主键 |
| `keyword` | `text` | NOT NULL | 关键词文本 |
| `type` | `text` | NOT NULL | `positive`（正向）或 `blacklist`（屏蔽）|
| `created_at` | `timestamptz` | `now()` | 创建时间 |

唯一约束: `(keyword, type)`。

**预设正向关键词（种子数据）:**
```
英文: tutorial, workflow, tips, how to, step by step, guide, setup, build,
      prompt engineering, use case, demo, walkthrough, comparison, review,
      best practices, toolchain, deep dive
中文: 教程, 实操, 工作流, 技巧, 分享, 经验, 玩法, 用法, 攻略, 测评,
      对比, 上手, 指南, 保姆级, 干货, 实战, 案例
```

**预设屏蔽关键词（种子数据）:**
```
英文: hiring, giveaway, breaking news, subscribe, follow me,
      sponsored, ad, promotion, discount, coupon
中文: 招聘, 抽奖, 转发抽, 广告, 优惠, 打折, 求职, 招人
```

#### 表: `monitor_settings` (监控设置)

| 列名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | 主键 |
| `key` | `text` | NOT NULL, UNIQUE | 设置项键名 |
| `value` | `text` | NOT NULL | 设置项值（以字符串存储）|
| `updated_at` | `timestamptz` | `now()` | 最后更新时间 |

初始行:
```
{ key: 'min_engagement', value: '500' }
```

---

### 变更 2: 新增 TypeScript 类型

**文件: `types.ts`** — 新增以下接口:

```typescript
interface TrustedAccount {
  id: string;
  platform: string;        // 'twitter' | 'xiaohongshu'
  handle: string;          // 不含 @
  category: string;        // 'image_gen' | 'video_gen' | 'vibe_coding'
  notes: string;           // 可选说明
  createdAt?: string;
}

interface QualityKeyword {
  id: string;
  keyword: string;
  type: 'positive' | 'blacklist';
  createdAt?: string;
}

interface MonitorSettings {
  minEngagement: number;   // 点赞 + 评论阈值
}
```

---

### 变更 3: Supabase 服务层

**文件: `services/supabaseService.ts`** — 新增 CRUD 函数:

```typescript
// ===== 信任账号 =====
getTrustedAccounts(): Promise<TrustedAccount[]>
  // SELECT * FROM trusted_accounts ORDER BY created_at DESC

saveTrustedAccount(account): Promise<TrustedAccount>
  // INSERT INTO trusted_accounts (platform, handle, category, notes)

updateTrustedAccount(account): Promise<void>
  // UPDATE trusted_accounts SET handle, category, notes WHERE id

deleteTrustedAccount(id): Promise<void>
  // DELETE FROM trusted_accounts WHERE id

// ===== 质量关键词 =====
getQualityKeywords(): Promise<QualityKeyword[]>
  // SELECT * FROM quality_keywords ORDER BY type, created_at DESC

saveQualityKeyword(keyword): Promise<QualityKeyword>
  // INSERT INTO quality_keywords (keyword, type)

deleteQualityKeyword(id): Promise<void>
  // DELETE FROM quality_keywords WHERE id

// ===== 监控设置 =====
getMonitorSettings(): Promise<MonitorSettings>
  // SELECT * FROM monitor_settings → 解析为 MonitorSettings 对象
  // 表为空时返回默认值 { minEngagement: 500 }

updateMonitorSetting(key, value): Promise<void>
  // UPSERT INTO monitor_settings (key, value, updated_at)
```

---

### 变更 4: 设置界面组件

**文件: `components/SettingsModal.tsx`** — 完全重写现有的空壳组件。

#### 4a: 侧边栏设置齿轮图标

**文件: `App.tsx`** — 在侧边栏底部（"XiaoCi 专业版"用户信息区域旁），添加 lucide-react 的 `Settings`（齿轮）图标按钮。

位置: 在 `<div className="p-4 border-t border-[#1e3a5f]/30 ...">` 块内，用户信息行的右侧添加齿轮图标。

```tsx
// App.tsx 新增状态
const [showSettings, setShowSettings] = useState(false);

// 侧边栏底部区域，修改用户信息行:
<div className="flex items-center gap-3 px-2 py-2 ...">
  {/* 现有头像 + 名称 */}
  <div>X</div>
  <div>XiaoCi / 专业版</div>

  {/* 新增: 设置齿轮图标 */}
  <button onClick={() => setShowSettings(true)}>
    <Settings size={18} className="text-gray-400 hover:text-gray-200" />
  </button>
</div>

// 渲染弹窗
{showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
```

#### 4b: 设置弹窗布局

弹窗包含 **3 个标签页**，样式与现有暗色主题一致（`bg-[#0a1628]` 等）:

**标签页 1: 信任账号 (Trusted Accounts)**
- 表格/列表展示所有信任账号
- 每行显示: 用户名、分类标签、备注、删除按钮
- 顶部"添加账号"表单:
  - 平台选择器（Twitter / 小红书）— 默认 Twitter
  - 用户名输入框（文本框，占位符: `@username`）
  - 分类选择器（下拉: AI绘画 / AI视频 / Vibe Coding）
  - 备注输入框（文本框，可选，占位符: 如"Claude Code 创造者"）
  - 添加按钮
- 行内编辑: 点击行可修改分类/备注
- 删除需二次确认

**标签页 2: 质量信号关键词 (Quality Keywords)**
- 两个区域并排（或上下排列）:
  - **正向关键词 (Positive)**: 绿色标签芯片，每个带 × 删除按钮
  - **屏蔽关键词 (Blacklist)**: 红色标签芯片，每个带 × 删除按钮
- 每个区域顶部有: 关键词输入框 + 类型选择器 + 添加按钮
- 首次加载时预设关键词已从数据库种子数据填充

**标签页 3: 互动量阈值 (Engagement Threshold)**
- 单个数字输入框
- 标签: "最低互动量（点赞 + 评论）"
- 显示当前值，带保存按钮
- 辅助说明文字: "信任账号的帖子不受此阈值限制"

---

### 变更 5: 修复互动量阈值 Bug

**文件: `api/cron-monitor.js`**

当前互动量阈值 `DEFAULT_MIN_INTERACTION = 5000` 似乎未正确生效。需要排查并修复。

#### 5a: 从 Supabase 读取阈值，替代硬编码常量

```javascript
// 修改前:
const DEFAULT_MIN_INTERACTION = 5000;

// 修改后: 运行时从 Supabase 获取
const { data: settingsRows } = await supabase
  .from('monitor_settings')
  .select('key, value')
  .eq('key', 'min_engagement');

const MIN_INTERACTION = settingsRows?.[0]?.value
  ? Number(settingsRows[0].value)
  : 500;  // 新默认值: 500
```

#### 5b: 互动量计算改为仅 点赞 + 评论

按用户需求，互动量 = 点赞 + 评论（不再是全部 5 项指标之和）:

```javascript
// 修改前:
// ... 求和 likes + replies + retweets + quotes + bookmarks

// 修改后:
const computeInteraction = (item) => {
  if (!item) return 0;
  if (item.platform === 'Twitter') {
    const raw = item.metricsRaw || {};
    const likes    = raw.like_count   ?? item.metrics?.likes    ?? 0;
    const comments = raw.reply_count  ?? item.metrics?.comments ?? 0;
    return likes + comments;
  }
  return (item.metrics?.likes || 0) + (item.metrics?.comments || 0);
};
```

#### 5c: 排查低于阈值的帖子为何出现

排查并修复根本原因。可能的问题:
- `effectiveMinInteraction` 通过 `?min=N` 查询参数被覆盖为 0
- 获取时指标数据 (`metricsRaw` / `metrics`) 为空/null，导致 `computeInteraction` 返回 0
- 小红书代理 API 或 Twitter API 返回的指标是字符串而非数字
- 手动搜索 (`api/search-social.js`) 是否有单独的代码路径完全跳过了互动量过滤——如果是，"近期热点"视图可能混合了定时任务和手动搜索的结果

**操作:** 添加 console.log/日志追踪定时任务运行时的确切互动量值和过滤决策，然后修复根本原因。

---

### 变更 6: 信任账号数据源

**文件: `api/cron-monitor.js`**

新增数据采集步骤: 获取信任账号的近期推文。

#### 6a: 从 Supabase 获取信任账号列表

```javascript
const { data: trustedAccounts } = await supabase
  .from('trusted_accounts')
  .select('*')
  .eq('platform', 'twitter');
```

#### 6b: 通过 Twitter API 获取信任账号推文

对每个信任账号，使用 Twitter API v2:
- 方案 A（用户时间线）: 先通过 `GET /2/users/by/username/:username` 解析 handle → user_id，再通过 `GET /2/users/:id/tweets` 获取近期推文
- 方案 B（更简单）: 将信任账号 handle 添加到搜索查询中，使用 `from:` 操作符:

```javascript
const trustedHandles = trustedAccounts.map(a => `from:${a.handle}`);
const trustedQuery = `(${trustedHandles.join(' OR ')}) -is:retweet`;
// 作为单独的搜索查询执行
```

#### 6c: 标记信任账号帖子

为信任账号的结果添加标记，以便跳过互动量过滤:

```javascript
results.forEach(r => {
  if (trustedHandleSet.has(r.author?.toLowerCase())) {
    r._fromTrustedAccount = true;
  }
});
```

#### 6d: 修改过滤管道

```javascript
// 互动量过滤: 信任账号跳过
results = results.filter(r =>
  r._fromTrustedAccount || computeInteraction(r) >= MIN_INTERACTION
);

// 质量关键词过滤（新增 — 适用于所有帖子，包括信任账号）
results = results.filter(r => passesQualityFilter(r, positiveKeywords, blacklistKeywords));
```

---

### 变更 7: 质量关键词过滤逻辑

**文件: `api/cron-monitor.js`** — 新增函数:

```javascript
/**
 * 质量关键词过滤
 * - 帖子包含任意屏蔽关键词 → 拒绝
 * - 帖子包含任意正向信号关键词 → 通过
 * - 帖子来自信任账号 → 通过（即使没有正向关键词，但仍受屏蔽词过滤）
 * - 其他情况 → 拒绝
 */
const passesQualityFilter = (item, positiveKeywords, blacklistKeywords) => {
  const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();

  // 屏蔽词检查: 命中任意屏蔽词即拒绝
  const isBlacklisted = blacklistKeywords.some(kw => text.includes(kw.toLowerCase()));
  if (isBlacklisted) return false;

  // 信任账号放行（仍受屏蔽词过滤）
  if (item._fromTrustedAccount) return true;

  // 正向关键词检查: 要求至少包含一个正向信号
  const hasPositiveSignal = positiveKeywords.some(kw => text.includes(kw.toLowerCase()));
  return hasPositiveSignal;
};
```

在定时任务 handler 开始时从 Supabase 获取关键词:

```javascript
const { data: keywordRows } = await supabase
  .from('quality_keywords')
  .select('keyword, type');

const positiveKeywords = keywordRows?.filter(k => k.type === 'positive').map(k => k.keyword) || [];
const blacklistKeywords = keywordRows?.filter(k => k.type === 'blacklist').map(k => k.keyword) || [];
```

---

### 变更 8: 保留现有 `isAIRelevant` 过滤

现有的 `isAIRelevant()` 函数（检查 `AI_KEYWORDS` 数组）保持不变。新的质量关键词过滤是**额外的一层**，不是替代。管道顺序变为:

```
1. 从 API 获取数据（关键词搜索 + 信任账号）
2. 互动量过滤（点赞 + 评论 ≥ 阈值，信任账号跳过）
3. 时效性过滤（Twitter 7 天内）
4. AI 相关性过滤（现有 isAIRelevant — 领域检查）
5. 质量关键词过滤（新增 — 内容质量检查）
6. 按 sourceUrl 去重
7. 保存到 Supabase
```

---

## 需修改文件汇总

| 文件 | 变更内容 |
|---|---|
| **Supabase 控制台** | 创建 3 张新表: `trusted_accounts`、`quality_keywords`、`monitor_settings`。填充预设数据。 |
| `types.ts` | 新增 `TrustedAccount`、`QualityKeyword`、`MonitorSettings` 接口 |
| `services/supabaseService.ts` | 新增 3 张新表的 CRUD 函数 |
| `components/SettingsModal.tsx` | 完全重写: 3 个标签页的设置 UI（信任账号、质量关键词、互动量阈值）|
| `components/Icons.tsx` | 确保导出了 `Settings` 图标（可能已导出）|
| `App.tsx` | 侧边栏底部添加设置齿轮图标 + 状态管理 + 弹窗渲染 |
| `api/cron-monitor.js` | 修复互动量 Bug; 从 Supabase 读取配置; 新增信任账号采集; 新增质量关键词过滤; 互动量公式改为仅点赞+评论 |

---

## UI 设计说明

- 匹配现有暗色主题: `bg-[#0a1628]`、`border-[#1e3a5f]`、文字颜色 `gray-100/400/500`
- 弹窗应足够大以便舒适管理（如 `max-w-2xl` 或 `max-w-3xl`）
- 分类标签使用现有配色方案: AI绘画（紫色）、AI视频（蓝色）、Vibe Coding（绿色）— 或匹配应用中现有标签颜色
- 设置齿轮图标: 默认柔灰色，悬停时变亮，位于用户信息行的右侧边缘
