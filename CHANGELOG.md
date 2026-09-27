# Changelog

## 0.2.0 (2026-09-27)

- A fourth window, 90 days (`?quarter`), read by the day like 30 days. The
  dashboard's window tabs show it; `windowOf()` knows it.
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
