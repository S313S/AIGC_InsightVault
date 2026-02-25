# AI High-Quality Content Filter & Visual Knowledge Base - Key Points Summary
# AI高质量内容过滤器 & 可视化知识库 - 要点总结

---

## 1. Product Goal / 产品目标

**EN:** Create a visual knowledge base that automatically filters high-quality AI content from social media, extracts actionable knowledge (especially prompts), and presents it in a card format ready for immediate use.

**CN:** 创建一个可视化知识库，自动从社交媒体筛选高质量AI内容，提取可操作的知识（尤其是提示词），并以可直接使用的卡片格式呈现。

**Core Value Proposition / 核心价值主张:**
- EN: Users can directly copy and use prompts without clicking through to original posts. Save both browsing time AND learning time.
- CN: 用户可以直接复制和使用提示词，无需点击进入原帖。同时节省浏览时间和学习时间。

---

## 2. Target Users / 目标用户

**EN:** AI vision practitioners and AI learners who need to stay updated on tool usage techniques and prompt writing methods, but lack time to filter and organize high-quality information.

**CN:** 需要及时了解工具使用技巧和提示词写法的AI视觉从业者/AI学习者，但没有时间筛选和整理高质量信息。

---

## 3. Data Sources / 数据来源

| Source / 来源 | Method / 方式 | Status / 状态 |
|---|---|---|
| Twitter | Official API / 官方API | Stable (baseline) / 稳定（基线） |
| Xiaohongshu / 小红书 | Third-party API / 第三方API | Stability TBD / 稳定性待验证 |
| Manual Input / 手动输入 | Paste link (auto-fetch + manual override) / 粘贴链接（自动获取+手动覆盖） | Always available / 始终可用 |

---

## 4. Data Acquisition Mode / 数据获取模式

**Hybrid Mode / 混合模式:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Acquisition / 数据获取                    │
├──────────────────────┬──────────────────────┬───────────────────┤
│  Auto Fetch          │  Instant Search      │  Manual Input     │
│  自动抓取（后台）      │  即时搜索（按需）      │  手动输入（粘贴链接）│
└──────────────────────┴──────────────────────┴───────────────────┘
                                    ↓
                         AI Filter / AI过滤
                    (tool name + engagement threshold)
                    （工具名称 + 互动阈值）
                                    ↓
                    Directly enter Knowledge Base
                    直接进入知识库（默认通过）
```

**Key Decision / 关键决策:**
- EN: No manual review step. AI-filtered posts are approved by default. Users retain final judgment by clicking original links.
- CN: 无需人工审核环节。AI过滤的帖子默认通过。用户通过点击原帖链接保留最终判断权。

---

## 5. Filtering Logic / 过滤逻辑

### 5.1 Primary Filter: Tool Name Keywords / 主要过滤器：工具名称关键词

**Visual Generation Tools / 视觉生成工具:**
- VEO3 series / VEO3系列
- Keling / 可灵
- Jimeng / 即梦
- Qwen / 通义千问

**Vibe Coding Tools / Vibe Coding工具:**
- Claude Code
- Open Code
- Codex
- Skill

### 5.2 Quality Gate / 质量门槛
- EN: Engagement threshold (likes, saves, comments). Specific values TBD during testing.
- CN: 互动阈值（点赞、收藏、评论）。具体数值在测试期间确定。

### 5.3 Filter Formula / 过滤公式

```
IF post contains [tool name] AND engagement >= threshold → enters knowledge base
IF 帖子包含 [工具名称] AND 互动量 >= 阈值 → 进入知识库
```

### 5.4 Extensibility / 可扩展性
- EN: Tool list expands organically via manual input when discovering new tools from followed bloggers.
- CN: 当从关注的博主处发现新工具时，工具列表通过手动输入有机扩展。
- EN: Users can add custom filter conditions later (date, whether from followed accounts, etc.)
- CN: 允许用户后续新增自定义过滤条件（日期、是否是关注对象等）

---

## 6. Content Types & Data Fields / 内容类型与数据字段

| Content Type / 内容类型 | Cover Source / 封面来源 | Data Fields / 数据字段 |
|---|---|---|
| Tool Usage Reviews / 工具使用评测 | First image / 帖子首图 | Cover, title, likes, saves, link / 封面、标题、点赞、收藏、链接 |
| Prompt Sharing (with effects) / 提示词分享（含效果图） | Effect image / 效果图 | Effect image, title, prompt text, likes, saves, link / 效果图、标题、提示词、点赞、收藏、链接 |
| Prompt Collection / 提示词合集 | Platform cover / 平台封面 | Cover, title, likes, saves, link (prompt may be external) / 封面、标题、点赞、收藏、链接（提示词可能在外链） |

---

## 7. Two-Level Display Structure / 两级展示结构

| Level / 层级 | Location / 位置 | Content / 内容 | Source / 来源 |
|---|---|---|---|
| Level 1 / 第一层 | Knowledge Base Card / 知识库卡片 | Cover + Title + Metrics + Link | From post data / 来自帖子数据 |
| Level 2 / 第二层 | Post Detail Page / 帖子详情页 | Cover + Prompt (if any) + AI Summary | AI-generated / AI生成 |

**AI Summary Generation Timing / AI摘要生成时机:**
- EN: Pre-generated at import time. Since posts passed quality filtering, they are confirmed high-quality. Pre-generation avoids loading delays.
- CN: 在导入时预生成。由于帖子已通过质量过滤，确认为高质量内容。预生成可避免加载等待。

**AI Summary Content / AI摘要内容:**
- EN: Experience covered, applicable context, core knowledge points
- CN: 涉及的经验、适用场景、核心知识点

---

## 8. System Workflow / 系统工作流程

1. **Data Acquisition / 数据获取:** Auto Fetch (background) + Instant Search (on-demand) + Manual Input
2. **AI Filtering / AI过滤:** Apply tool name + engagement threshold filters
3. **AI Summary Generation / AI摘要生成:** Pre-generate summary for filtered posts
4. **Knowledge Base Card Display / 知识库卡片展示:** Cover + Title + Metrics + Link
5. **Post Detail Page Display / 帖子详情页展示:** Cover + Prompt (if any) + AI Summary
6. **User Access / 用户访问:** Browse cards → Click for details or original post

---

## 9. Database Design / 数据库设计

### Design Principles / 设计原则
- EN: Single posts table with JSON tags for flexible filtering (like Lark multi-dimensional tables)
- CN: 使用JSON标签的单一帖子表，实现灵活过滤（类似飞书多维表格）
- EN: Multi-user support from the start
- CN: 从一开始就支持多用户
- EN: No review status needed — AI-filtered posts directly enter knowledge base
- CN: 无需审核状态 — AI过滤的帖子直接进入知识库

### Tables / 数据表

| Table / 表名 | Description / 说明 |
|---|---|
| users | User accounts / 用户账户 |
| posts | Main content with JSON tags / 主内容表，含JSON标签 |
| tags | Available tool tags / 可用工具标签 |
| user_filters | User-defined filter configs / 用户自定义过滤配置 |

### Key Fields in posts Table / posts表关键字段
- `tags`: JSON array, e.g. `["Claude Code", "Skill"]`
- `ai_summary`: Pre-generated AI summary / 预生成的AI摘要
- `prompt_text`: Extracted prompt if available / 提取的提示词（若有）
- `source`: 'twitter' | 'xiaohongshu' | 'manual'
- `content_type`: 'tool_review' | 'prompt_sharing' | 'prompt_collection'

---

## 10. MVP Scope / MVP范围

### In Scope / 包含范围
- Twitter API integration (stable baseline) / Twitter API集成（稳定基线）
- Xiaohongshu API integration (validate stability) / 小红书API集成（验证稳定性）
- Manual link input with auto-fetch + manual override / 手动链接输入
- Hybrid data acquisition (auto + instant search + manual) / 混合数据获取模式
- Keyword-based filtering (tool names) / 基于关键词的过滤
- Engagement threshold filtering / 互动阈值过滤
- AI content summary generation (pre-generated) / AI内容摘要生成（预生成）
- Visual knowledge base with two-level structure / 可视化知识库（两级结构）
- Multi-user support / 多用户支持

### Out of Scope (Future) / 排除范围（未来）
- Automatic prompt extraction from images (OCR) / 从图片自动提取提示词
- Cross-platform deduplication / 跨平台去重
- Recommendation system / 推荐系统

---

## 11. Technical Approach / 技术方案

- EN: Encapsulate data download tool as Claude Code Skill for convenient local data upload
- CN: 将数据下载工具封装为Claude Code Skill，方便本地上传数据
- EN: Validate both APIs in parallel, ensure Twitter as stable baseline
- CN: 并行验证两个API，确保Twitter作为稳定基线
- EN: Cost consideration: ~0.15 RMB per post via API; AI filtering is cost-effective
- CN: 成本考虑：通过API每条帖子约0.15元；AI过滤更具性价比

---

## 12. Key Design Decisions Summary / 关键设计决策总结

| Decision / 决策 | Choice / 选择 | Reason / 原因 |
|---|---|---|
| Tool list storage / 工具列表存储 | JSON tags, not separate tables / JSON标签，非独立表 | Flexible like Lark tables / 灵活如飞书多维表格 |
| AI summary timing / AI摘要时机 | Pre-generate at import / 导入时预生成 | Avoid loading delays / 避免加载等待 |
| Review process / 审核流程 | None, auto-approved / 无，自动通过 | User retains judgment via original link / 用户通过原帖链接保留判断权 |
| Data acquisition / 数据获取 | Hybrid (auto + instant + manual) / 混合模式 | Balance automation and control / 平衡自动化与控制 |
| Multi-user / 多用户 | Supported from start / 从一开始支持 | Future scalability / 未来可扩展性 |

---

## Documents Generated / 已生成文档

1. **PRD v2 (EN & CN)** - Product Requirements Document / 产品需求文档
2. **Database Schema (EN & CN)** - Database Design Document / 数据库设计文档
3. **This Summary (Bilingual)** - Key Points for Reuse / 要点总结供复用

---

*Last Updated / 最后更新: January 2026*
