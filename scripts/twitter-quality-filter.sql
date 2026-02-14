-- Twitter Quality Filter - Supabase schema and seed

create extension if not exists pgcrypto;

create table if not exists trusted_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'twitter',
  handle text not null,
  category text not null check (category in ('image_gen', 'video_gen', 'vibe_coding')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (platform, handle)
);

create table if not exists quality_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  type text not null check (type in ('positive', 'blacklist')),
  created_at timestamptz not null default now(),
  unique (keyword, type)
);

create table if not exists monitor_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into monitor_settings (key, value)
values ('min_engagement', '500')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

insert into quality_keywords (keyword, type)
values
  ('tutorial', 'positive'),
  ('workflow', 'positive'),
  ('tips', 'positive'),
  ('how to', 'positive'),
  ('step by step', 'positive'),
  ('guide', 'positive'),
  ('setup', 'positive'),
  ('build', 'positive'),
  ('prompt engineering', 'positive'),
  ('use case', 'positive'),
  ('demo', 'positive'),
  ('walkthrough', 'positive'),
  ('comparison', 'positive'),
  ('review', 'positive'),
  ('best practices', 'positive'),
  ('toolchain', 'positive'),
  ('deep dive', 'positive'),
  ('教程', 'positive'),
  ('实操', 'positive'),
  ('工作流', 'positive'),
  ('技巧', 'positive'),
  ('分享', 'positive'),
  ('经验', 'positive'),
  ('玩法', 'positive'),
  ('用法', 'positive'),
  ('攻略', 'positive'),
  ('测评', 'positive'),
  ('对比', 'positive'),
  ('上手', 'positive'),
  ('指南', 'positive'),
  ('保姆级', 'positive'),
  ('干货', 'positive'),
  ('实战', 'positive'),
  ('案例', 'positive'),
  ('hiring', 'blacklist'),
  ('giveaway', 'blacklist'),
  ('breaking news', 'blacklist'),
  ('subscribe', 'blacklist'),
  ('follow me', 'blacklist'),
  ('sponsored', 'blacklist'),
  ('ad', 'blacklist'),
  ('promotion', 'blacklist'),
  ('discount', 'blacklist'),
  ('coupon', 'blacklist'),
  ('招聘', 'blacklist'),
  ('抽奖', 'blacklist'),
  ('转发抽', 'blacklist'),
  ('广告', 'blacklist'),
  ('优惠', 'blacklist'),
  ('打折', 'blacklist'),
  ('求职', 'blacklist'),
  ('招人', 'blacklist')
on conflict (keyword, type) do nothing;
