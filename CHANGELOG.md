# Changelog

## 0.2.0 (2026-09-27)

- **The windows are yours to choose.** A new `windows` option on
  `createAnalytics()` (or `ANALYTICS_WINDOWS`) picks the dashboard's tabs:
  which, in what order, up to eight. Presets are `24h`, `7d`, `30d`, and new,
  `90d` (`?quarter`) and `12m` (`?year`); a window of your own is
  `{ key, label, ms }`, linked as `?window=<key>`. The default is unchanged:
  24 hours, 7 days, 30 days. One window shows no tabs.
- The server sends the list with the numbers (`window` and `windows` on every
  set), and the dashboard draws its tabs from it, so the tabs can't disagree
  with the server.
- The chart reads a window longer than four months by the week.
- **Breaking:** `WINDOWS` and `WINDOW_KEYS` are gone. Use `WINDOW_PRESETS`,
  `resolveWindows()` and the server's `windows()`. `windowOf()` takes the
  site's list as a second argument; a page should call `analytics.windowOf()`.
  `<WindowTabs>` needs `windows`. `initialWindow` is optional on
  `<Dashboard>` and `useNumbers()`.
- Installable straight from GitHub: `npm install github:konsfyi/analytics`
  builds the package on install (a `prepare` script). The README has a new
  "Without npm" section covering that, forks and a local copy.

## 0.1.0 (2026-09-26)

First release as `@konsfyi/analytics`. The same code shipped a day earlier as
`@konsfyi/tally` 0.1.0, now deprecated: the name clashed with Tally, the form
builder. Coming from it:

- Install `@konsfyi/analytics` and swap the import paths.
- `createTally()` is now `createAnalytics()`, and its return type `Tally` is
  now `AnalyticsServer`.
- The file store's default directory is `.analytics` instead of `.tally`.
- The tracker's default `prefix` is `analytics` instead of `tally`. Pass
  `prefix: "tally"` to keep the keys browsers already hold.
- Log and error messages start with `analytics:`.

Extracted from the analytics behind
[play.kons.design](https://play.kons.design/analytics):

- `createAnalytics()`: a web-standard collector and report route, a read gate
  that is private by default, per-address rate limits, a body cap, an origin
  check, and field-by-field validation.
- Stores: a JSON-lines file, Neon over HTTP, and any Postgres through `pg`,
  sharing one set of SQL.
- A framework-free tracker (`start()`, `track()`), and `<Analytics />` for
  Next.
- The dashboard: plain CSS on custom properties, set in Inter, with animated
  refreshes that respect `prefers-reduced-motion`.
