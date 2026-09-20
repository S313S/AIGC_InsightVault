# Trending Homepage Refresh Design

## Goal

Let an administrator publish newly fetched trending data to the current homepage without reloading the browser, while keeping browser refresh as an automatic data reload path.

## Behavior

- A successful manual trending fetch refreshes the homepage data immediately.
- A persistent `更新首页热点` button beside `启动热点抓取` lets the administrator refresh again without running another fetch.
- The manual button is disabled while a fetch or homepage refresh is already running.
- A homepage refresh failure does not relabel a successful fetch as a failed fetch; the data loader returns an explicit status and the UI asks the administrator to retry with the manual button.
- Browser refresh keeps using the existing `loadData` path, so it continues to pull the latest trending snapshot.

## Architecture

`App.tsx` owns the data-loading state and passes a refresh callback into `SettingsModal`. The modal calls that callback after a successful `/api/cron-monitor` response and from the new manual button. Reusing `loadData` keeps card, trending, collection, task, cache, and fallback behavior consistent with a normal page load.
