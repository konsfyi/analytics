# @konsfyi/analytics

Tiny cookieless analytics for your own websites. One endpoint, one dashboard,
no cookies, and no analytics company in between.

**Live demo: [play.kons.design/analytics](https://play.kons.design/analytics)**.
That page is the package counting its own site, with the numbers public.

```sh
npm install @konsfyi/analytics
```

Or straight from GitHub, no registry involved: see [Without npm](#without-npm).

- **One endpoint.** The page posts a few hundred bytes: which page, an id for
  the visit, the window width. Everything else is worked out on the server.
- **One dashboard.** Visitors, views, visits, bounce, visit time, a chart, and
  pages, channels, referrers, countries, devices, events, systems, browsers and
  screens. It refreshes every 30 seconds and animates the changes.
- **No cookies, no fingerprint that lasts.** A visitor is a salted hash of
  address + user agent + today's date, so the same person gets a new id
  tomorrow and nobody can be followed from one day to the next.
- **Your database, or none.** Postgres (Neon over HTTP, or any Postgres through
  `pg`), or a plain file when nothing is configured.
- **Small.** No runtime dependencies. React, Next and `pg` are optional peers,
  used only by the parts that need them.

## Read this first

A few things this package does differently from most tools, stated plainly:

- **The dashboard is private by default.** Nobody can read the numbers until
  you either pass `public: true` or set a token. A private dashboard that has
  no token set lets nobody in, not everybody. A refused request is a 404.
- **"Visitors" over a week counts person-days, not people.** The visitor id
  changes every day on purpose, so someone who comes on Monday and Tuesday
  counts twice. Views, visits, pages, countries and events are exact.
- **Bounce means one view and under ten seconds.** Most tools count any
  one-page visit as a bounce. Here, someone who reads one page for a minute
  has not bounced.
- **Visit time is the median visit, capped at 30 minutes**, so one tab left
  open all afternoon doesn't drag the figure.
- **Set a salt.** The visitor hash is only as anonymous as its salt. With no
  `ANALYTICS_SALT`, one is derived from the database url, which means changing
  that url resets every visitor id. With no database either, the process makes
  one up and warns you.
- **Know your proxy.** `x-forwarded-for` is only believed behind a known
  platform (Vercel, Netlify, Cloudflare Pages, Render) or when you set
  `trustProxy`. Otherwise a client could forge the header and mint any visitor
  id it liked. See [self-hosting](docs/self-hosting.md).
- **The rate limit is per instance.** One address gets 120 hits a minute. On
  a platform running several instances, the real ceiling is that times the
  number of instances. The limit is there to make a flood expensive, not to
  meter anyone precisely.

What every figure means, exactly: [docs/metrics.md](docs/metrics.md). What is
stored and what isn't: [docs/privacy.md](docs/privacy.md).

## Next.js in four files

```ts
// lib/analytics.ts
import { createAnalytics } from "@konsfyi/analytics/server";

export const analytics = createAnalytics({ site: "example.com" });
```

```ts
// app/api/hit/route.ts: the one endpoint
import { analytics } from "@/lib/analytics";

export const runtime = "nodejs";
export const POST = analytics.collect;
```

```ts
// app/api/analytics/route.ts: the numbers, for the dashboard to refresh
import { analytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const GET = analytics.report;
```

```tsx
// app/layout.tsx: count every page
import { Analytics } from "@konsfyi/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics site="example.com" />
      </body>
    </html>
  );
}
```

And the dashboard, wherever you want it:

```tsx
// app/analytics/page.tsx
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Dashboard } from "@konsfyi/analytics/dashboard";
import "@konsfyi/analytics/dashboard.css";
import { analytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const asked = await searchParams;
  const head = await headers();
  const token = typeof asked.token === "string" ? asked.token : null;
  if (!analytics.mayRead((name) => head.get(name), token)) notFound();

  return (
    <Dashboard
      initial={await analytics.numbers(analytics.windowOf(asked))}
      backend={analytics.backend()}
    />
  );
}
```

A complete site is in [examples/next-minimal](examples/next-minimal). The full
set of options is in [docs/install.md](docs/install.md).

### Choosing the windows

The dashboard's tabs are yours to pick: which windows, in what order, how many
(up to eight). Say so once, on the server; the dashboard draws whatever the
server sends.

```ts
export const analytics = createAnalytics({
  site: "example.com",
  windows: ["24h", "7d", "30d", "90d", { key: "2w", label: "2 weeks", ms: 14 * 86_400_000 }],
});
```

The presets are `24h`, `7d`, `30d`, `90d` and `12m`; anything else is a key, a
label and a length. The default is `24h`, `7d` and `30d`. The first window is
the page itself, and each of the others has its own URL (`?week`, `?month`,
`?quarter`, `?year`, `?window=2w`) so it can be linked to. A single window
shows no tabs at all.

## Anywhere else

`collect` and `report` are plain `(Request) => Promise<Response>`, so any
server that speaks web-standard requests can mount them directly: Hono,
Bun, Deno, Cloudflare Workers, Remix, Astro, SvelteKit.

```ts
import { Hono } from "hono";
import { createAnalytics } from "@konsfyi/analytics/server";

const analytics = createAnalytics({ site: "example.com", trustProxy: true });
const app = new Hono();
app.post("/api/hit", (c) => analytics.collect(c.req.raw));
app.get("/api/analytics", (c) => analytics.report(c.req.raw));
```

On a page with no framework at all:

```html
<script type="module">
  import { start } from "https://esm.sh/@konsfyi/analytics/client";
  start({ site: "example.com" });
</script>
```

`start()` counts the first view, a view on every history change (so a
single-page app counts its routes), and how long the visit lasted when the tab
goes away. `track("signup", { plan: "pro" })` records an event.

## Without npm

The package doesn't need the registry. Three ways, from least to most yours:

- **Straight from GitHub.** npm builds it on install:

  ```sh
  npm install github:konsfyi/analytics
  ```

  Add `#<commit>` to pin an exact version. pnpm and yarn do the same with
  their own `add`.
- **From your fork.** Fork the repo, change whatever you like, and install
  yours: `npm install github:<you>/analytics`. The import paths stay
  `@konsfyi/analytics/…`. Syncing the fork on GitHub brings in later changes.
- **As a folder of your own.** Clone it next to your site, run
  `npm install && npm run build` in it, then `npm install ../analytics` from
  your site. Or copy `src/` into your project. It is plain TypeScript with no
  runtime dependencies.

It's MIT: use it, change it, ship it. You don't need to ask.

## Theming the dashboard

The dashboard is plain CSS on custom properties. There's no Tailwind and
nothing inherited from the page. Everything sits under one `.an` class, and a
host restyles it by redefining the properties:

```css
.an.my-site {
  --an-font: "Your Face", system-ui, sans-serif;
  --an-ink: #111;
  --an-fill: #f4f4f2;
}
```

It is set in Inter by default and loads no font itself. Every custom property
is listed at the top of [`dashboard.css`](src/dashboard/dashboard.css).
Animations respect `prefers-reduced-motion`.

## Staying out of your own numbers

Open any page of your site with `?analytics=off` once. That browser is never
counted again, and the server remembers the device too, so a private window of
the same browser stays uncounted as well. `?analytics=on` undoes it, and also
lets that browser count on localhost for testing. Do Not Track is honoured,
and bots that say they are bots are dropped.

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: it
explains what the package will stay (small, cookieless, no cross-day identity) and
what a change needs to get merged. Security issues go to
[SECURITY.md](SECURITY.md), not to a public issue.

MIT © [Kons](https://kons.design)
