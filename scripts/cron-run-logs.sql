-- Cron monitor audit log table

create extension if not exists pgcrypto;

create table if not exists cron_run_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  trigger_source text not null default 'manual',
  request_method text not null default 'GET',
  request_url text not null default '',
  query_params jsonb not null default '{}'::jsonb,
  effective_params jsonb not null default '{}'::jsonb,
  keyword_execution jsonb not null default '{}'::jsonb,
  api_call_trace jsonb not null default '[]'::jsonb,
  api_calls_summary jsonb not null default '{}'::jsonb,
  funnel jsonb not null default '{}'::jsonb,
  platform_funnel jsonb not null default '{}'::jsonb,
  platform_stats jsonb not null default '[]'::jsonb,
  platform_totals jsonb not null default '{}'::jsonb,
  platform_errors jsonb not null default '[]'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  runtime_ms integer not null default 0,
  runtime_guard_triggered boolean not null default false,
  success boolean not null default true,
  error_message text
);

create index if not exists idx_cron_run_logs_created_at
  on cron_run_logs (created_at desc);

create index if not exists idx_cron_run_logs_success_created_at
  on cron_run_logs (success, created_at desc);
