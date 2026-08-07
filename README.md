**追踪小红书和 X 上真正在热的 AI 内容 —— 谁在说、说了什么、数据多少。**

不是又一个「AI 资讯聚合」。它抓的是**原始帖子和它们的真实数据**，每一条都能点回原文，自己判断值不值得看。

🔗 **[在线体验](https://aigc-insight-vault.vercel.app)**

---

<!-- ⬇️ 在这里放看板截图。这类工具没有截图，没人有耐心读完文字。
     建议放两张：① 主看板列表 ② 单条内容的详情/数据。
     放好后把这段注释删掉。
![看板](docs/dashboard.png)
-->
- **热门数据抓取方式**

1）手动导入
<img width="2904" height="1600" alt="CleanShot 2026-08-07 at 18 34 56@2x" src="https://github.com/user-attachments/assets/c961fddf-1d6a-4f76-b8fc-81ac2fa4541e" />
      
2）自动抓取
<img width="2940" height="1602" alt="CleanShot 2026-08-07 at 18 36 44@2x" src="https://github.com/user-attachments/assets/ddb313a0-4fd0-49d9-8582-d17316a2bdfd" />

- **保存有价值的帖子**
<img width="2940" height="1606" alt="CleanShot 2026-08-07 at 18 32 31@2x" src="https://github.com/user-attachments/assets/83ffc2f3-329c-4b5d-947e-2c368bc1b454" />


## 它做什么

```text
定时抓取  →  入库归档  →  看板呈现
小红书 · X     Supabase      按账号 / 话题 / 热度看
```

- **两个平台** —— 小红书和 X（Twitter），两边的 AI 内容放在一起看
- **原帖 + 原数据** —— 保留作者、链接、时间和互动数据，结论可回溯
- **定时跑** —— 不用手动刷，按计划抓取归档
- **按人隔离** —— Supabase 行级安全（RLS），数据归属到账号

## 一个实现上的选择：小红书的双供应商回退

小红书没有公开 API，第三方数据服务各有各的不稳定。所以这里没有绑死一家，而是**同时接了 JustOneAPI 和 TikHub，可以自动回退**：

```text
XHS_NOTE_PROVIDER     auto | justone | tikhub    单篇抓取，默认 auto
XHS_SEARCH_PROVIDER   auto | justone | tikhub    关键词搜索，默认 auto
```

`auto` 模式下一家挂了自动换另一家。做数据采集的项目，**单点依赖第三方是最容易翻车的地方** —— 这一层是被现实逼出来的。

---

## 本地运行

**环境要求：** Node.js

**1）装依赖**

```bash
npm install
```

**2）配环境变量**

在 `.env`（或 Vercel 项目环境变量）里填：

```text
# 前端
VITE_GEMINI_API_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

# 服务端
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CRON_OWNER_USERNAME          # 默认 xiaoci

# 数据源
X_API_BEARER_TOKEN                       # X 抓取与搜索
JUSTONEAPI_TOKEN / TIKHUB_API_TOKEN      # 小红书，二选一或都填（支持回退）

# 可选
XHS_NOTE_PROVIDER            # auto | justone | tikhub，默认 auto
XHS_SEARCH_PROVIDER          # auto | justone | tikhub，默认 auto
TIKHUB_XHS_SEARCH_PATH       # 默认 /api/v1/xiaohongshu/app/search_notes
```

**3）初始化数据库**

在 Supabase 的 SQL Editor 里执行：

```text
scripts/supabase-auth-rls.sql
```

这一步会建 `profiles` 表、写入初始账号、把已有数据补上归属关系，并开启 RLS。

**4）跑起来**

```bash
npm run dev
```

**技术栈：** React · TypeScript · Vite · Supabase · Google Gemini API · X API · Vercel

---

## 和 Owli 的关系

我同时在做另一个工具 Owli，也从社交媒体取数，但**两者是并存的两个产品，不是一个的两个版本**：

| | InsightVault | Owli |
| --- | --- | --- |
| 形态 | **持续追踪** | **一次性调研** |
| 你做什么 | 定好要盯的范围，它一直帮你盯 | 提一个问题，它跑一遍出报告 |
| 产出 | 一个持续更新的看板 | 一份带证据链的报告 |
| 用来回答 | 「这两周 AI 圈在聊什么」 | 「茶叶领域哪些竞品在做社交媒体，做得最好的是谁」 |

一个解决「别错过」，一个解决「搞清楚」。放在一起用是顺的：看板上冒出来的东西，值得深挖的丢给 Owli。

---

## 为什么做这个

做内容的人每天都有同一个焦虑：**是不是漏了什么。**

刷信息流能缓解焦虑，但缓解不了问题 —— 你刷到的是算法喂给你的，不是真正在热的。而且刷完什么都没留下，第二天从头再来。

所以这个工具的目标很朴素：**把「刷」变成「查」。** 数据存下来，想看的时候按条件查，而不是被推荐流牵着走。

做的过程里最花时间的不是界面，是**数据采集那一层**。小红书没有公开 API，第三方服务各有各的脾气和限流；抓回来的字段还各不相同，得先归一化才能进库。文档上「信息采集」四个字，实际是一堆接口、反爬和格式差异 —— 这一课在这里学到了，后来直接用在了 Owli 的设计上。

---

<details>
<summary><b>English</b></summary>

<br>

# AIGC InsightVault

**Tracks what's actually trending in AI on Xiaohongshu and X — who said it, what they said, what the numbers were.**

Not another AI news aggregator. It captures the **original posts and their real engagement data**, so every item links back to the source and you judge for yourself.

🔗 **[Live](https://aigc-insight-vault.vercel.app)**

## What it does

```text
scheduled fetch  →  archive  →  dashboard
Xiaohongshu · X     Supabase     by account / topic / traction
```

- **Two platforms** — AI content from Xiaohongshu and X in one place
- **Original posts, original numbers** — author, link, timestamp and engagement preserved, so conclusions stay traceable
- **Runs on a schedule** — no manual scrolling
- **Per-user isolation** — Supabase row-level security scopes data to an owner

## One implementation choice: dual-provider fallback for Xiaohongshu

Xiaohongshu has no public API, and third-party data services are each unreliable in their own way. So this doesn't bet on one — it wires up **both JustOneAPI and TikHub with automatic fallback**:

```text
XHS_NOTE_PROVIDER     auto | justone | tikhub    single-note fetch, default auto
XHS_SEARCH_PROVIDER   auto | justone | tikhub    keyword search, default auto
```

In `auto`, one provider failing rolls over to the other. For any scraping project, **a single third-party dependency is where things break first** — this layer exists because reality forced it.

## Running locally

Node.js, then `npm install`. Set the env vars below in `.env` or your Vercel project, run `scripts/supabase-auth-rls.sql` in the Supabase SQL editor (creates `profiles`, seeds the initial account, backfills ownership on existing rows and enables RLS), then `npm run dev`.

```text
VITE_GEMINI_API_KEY · VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY
SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · CRON_OWNER_USERNAME
X_API_BEARER_TOKEN
JUSTONEAPI_TOKEN and/or TIKHUB_API_TOKEN
optional: XHS_NOTE_PROVIDER · XHS_SEARCH_PROVIDER · TIKHUB_XHS_SEARCH_PATH
```

Built with React, TypeScript, Vite, Supabase, the Gemini API, the X API, deployed on Vercel.

## How this relates to Owli

I'm also building Owli, which also pulls from social. They **coexist as two products**, not two versions of one:

| | InsightVault | Owli |
| --- | --- | --- |
| Shape | **Continuous tracking** | **One-off research** |
| You do | Define a scope; it watches it | Ask a question; it runs once |
| Output | A dashboard that keeps updating | A report with an evidence chain |
| Answers | "What's the AI world talking about this fortnight?" | "Who's doing social well in the tea category, and why?" |

One solves *don't miss it*. The other solves *understand it*. Used together, anything worth digging into on the dashboard goes to Owli.

## Why I built it

Anyone working in content carries the same low-grade anxiety: **am I missing something?**

Scrolling relieves the feeling but not the problem — what you see is what the algorithm fed you, not what's actually moving. And nothing survives the session; tomorrow you start over.

So the goal here is plain: **turn scrolling into querying.** Store the data, query it on your terms, instead of being steered by a recommendation feed.

The expensive part wasn't the interface — it was **collection**. No public API, third-party services each with their own quirks and rate limits, and returned fields that don't match, so everything needs normalising before it lands. Four words in a spec ("collect the information") turn out to be a pile of endpoints, anti-bot measures and format differences. That lesson went straight into how I designed Owli.

</details>
