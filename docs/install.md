# Install

```sh
npm install @konsfyi/analytics
npm install pg   # only if you use a Postgres that is not Neon
```

## The entry points

| Import | What it is | Runs on |
| --- | --- | --- |
| `@konsfyi/analytics` | The shapes, `summarize()`, the user-agent and referrer parsing, the windows | anywhere |
| `@konsfyi/analytics/server` | `createAnalytics()`, the stores | a server (Node 20+, or any runtime with `node:crypto`) |
| `@konsfyi/analytics/client` | The tracker: `start()`, `track()`, `pageview()` | a browser |
| `@konsfyi/analytics/next` | `<Analytics />`, `<Track />`, `track()` for a Next app | a browser |
| `@konsfyi/analytics/dashboard` | `<Dashboard />`, `<Numbers />`, `useNumbers()` | React 18+ |
| `@konsfyi/analytics/dashboard.css` | The dashboard's stylesheet | anywhere CSS goes |

## Server options

Everything is optional. Each option falls back to an environment variable,
then to a default. An option given in code wins over the environment.

```ts
import { createAnalytics } from "@konsfyi/analytics/server";

export const analytics = createAnalytics({
  site: "example.com",
  public: false,
  token: process.env.ANALYTICS_TOKEN,
});
```

| Option | Environment | Default | What it does |
| --- | --- | --- | --- |
| `site` | `ANALYTICS_SITE` | none | The hostname being counted. Posts are taken from this host and from the collector's own. Referrers from it are not counted as a source. |
| `public` | `ANALYTICS_PUBLIC` | `false` | Whether anyone may read the numbers. |
| `token` | `ANALYTICS_TOKEN` | none | Opens a private dashboard. Send it as `Authorization: Bearer …`, `x-analytics-token`, or `?token=` in a browser. |
| `databaseUrl` | `ANALYTICS_DATABASE_URL`, then `DATABASE_URL` | none | A Postgres url. A Neon host uses Neon's HTTP endpoint; any other host uses `pg`. With no url, the file store is used. |
| `salt` | `ANALYTICS_SALT` | derived from the database url, with a warning | What the visitor hash is salted with. |
| `trustProxy` | `ANALYTICS_TRUST_PROXY` | 1 on Vercel, Netlify, Cloudflare Pages, Render; 0 elsewhere | How many proxies in front of the server may be believed about `x-forwarded-for`. `true` means 1, `false` means 0. |
| `countryHeader` | `ANALYTICS_COUNTRY_HEADER` | none | A header to read the country from, tried before the known ones. |
| `dir` | `ANALYTICS_DIR` | `.analytics` in the working directory | Where the file store keeps its files. Add it to `.gitignore`. |
| `store` | none | picked from `databaseUrl` | A `Store` of your own. |

`createAnalytics()` returns:

- `collect(req)`: the endpoint. Always answers 204.
- `report(req)`: one window's numbers as JSON, behind the read gate.
  `?week`, `?month` and `?quarter` pick the window; the default is the last 24 hours.
- `numbers(window)`: the same figures as `report`, called directly, for a page
  that renders the first set on the server.
- `mayRead(header, token)`: whether a request may see the numbers.
- `backend()`: which store is in use, as the dashboard names it.
- `store()`: the store itself.

Make one instance per process and share it. Each instance has its own rate
limit and its own store connection.

## Tracker options

```tsx
<Analytics site="example.com" endpoint="/api/hit" prefix="analytics" />
```

| Option | Default | What it does |
| --- | --- | --- |
| `site` | none | The hostname being counted. Anywhere else (localhost, previews) is not counted unless the browser has been switched on with `?analytics=on`. With no site set, every host counts except localhost and `*.local`. |
| `endpoint` | `/api/hit` | Where `collect` is mounted. |
| `prefix` | `analytics` | Namespace for the two keys the browser keeps: `[prefix]:visit` in sessionStorage, `[prefix]:analytics` in localStorage. |

`<Analytics>` applies its options when it renders. If something may call
`track()` before that, call `configure()` with the same options first (at the
top of the module that renders `<Analytics>`, for instance).

Events:

```ts
import { track } from "@konsfyi/analytics/next"; // or /client
track("copy-code", { file: "button.tsx" });
```

At most ten keys per event. Keys are up to 40 characters, values are strings
(up to 200 characters), finite numbers or booleans. Anything else is dropped.
The dashboard counts events by name; the detail is kept in the row.

For a link inside a server component, which can't take a handler, wrap it:

```tsx
<Track event="open-docs"><a href="/docs">Docs</a></Track>
```

## The dashboard

`<Dashboard>` is the whole page: a header with the window tabs, and the
figures. Give it the first set from the server and it keeps itself current.

| Prop | What it is |
| --- | --- |
| `initial` | The first numbers, from `analytics.numbers(key)` |
| `initialWindow` | `"24h"`, `"7d"`, `"30d"` or `"90d"`, usually `windowOf(searchParams)` |
| `backend` | `analytics.backend()`, named in the footer |
| `title` | The heading. Default `Analytics` |
| `at` | Where `report` is mounted. Default `/api/analytics` |
| `path` | The dashboard's own path, for the window in the URL. Default `/analytics` |

A private dashboard opened with `?token=` keeps the token when it refreshes
and when it switches windows, so the page and the route can share one gate.

For a site with its own chrome, `useNumbers(initial, initialWindow, at, path)`
drives the state and `<Numbers numbers live backend />` draws the figures. Put
the window switcher wherever you like; `<WindowTabs>` is there if you want the
plain one.

Import the stylesheet once: `import "@konsfyi/analytics/dashboard.css"`.
