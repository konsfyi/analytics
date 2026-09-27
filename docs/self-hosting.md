# Self-hosting

The package runs anywhere a server can take a POST. What changes from place to
place is how much of the request can be believed, and where the rows go.

## The proxy setting, first

The visitor id is a hash of the visitor's address, among other things. The
address comes from `x-forwarded-for`, which is a list: every proxy between the
visitor and your server adds the address it saw. The client can also set the
header to anything before it starts.

So only the entries your own proxies wrote are worth believing, counted from
the right. `trustProxy` says how many that is:

- **On Vercel, Netlify, Cloudflare Pages or Render** you don't need to set
  anything. The platform rewrites the header and one hop is assumed.
- **Behind one reverse proxy** (nginx, Caddy, a load balancer): `trustProxy: 1`.
- **Behind a CDN and then a proxy**: `trustProxy: 2`, and so on.
- **Nothing in front** (the server takes connections straight from the
  internet): `trustProxy: false`. The header is ignored.

With nothing set on an unknown platform, the header is ignored and a warning
is logged. Every visit then shares one address, so visitor counts collapse.
That failure is visible, where believing a forged header would pass unnoticed.

If your proxy puts the address somewhere other than `x-forwarded-for`, set
`x-real-ip`: it is read when the chain is empty.

## Country

The country comes from whatever your platform puts in a header:
`x-vercel-ip-country`, `cf-ipcountry`, Netlify's `x-nf-geo`,
`fastly-client-country-code`, `x-country-code` or `x-geo-country`. If yours
uses another header, name it with `countryHeader`. With none of these, the
country is recorded as unknown. The package never looks an address up itself.

## Where the rows go

- **No database**: the file store writes `analytics.jsonl` and
  `analytics-muted.json` into `.analytics/` (or `dir`). That's fine on one
  long-running server. On a serverless platform the disk doesn't last, so use a
  database there.
- **Neon**: set `DATABASE_URL` to the normal `postgres://` url. The package speaks
  Neon's HTTP endpoint, with no pool and no socket, which suits functions that
  live for 200ms.
- **Any other Postgres**: set the url and `npm install pg`. A pool of three
  connections is opened on first use.
- **Anything else**: implement the four-method `Store` interface
  (`record`, `read`, `mute`, `muted`) and pass it as `store`. `sqlStore(name,
  exec)` gives you the whole Postgres store over any function that runs one
  parameterised statement.

The tables (`hit` and `muted`) are created on first use. Nothing is ever
deleted from `hit`. Rows in `muted` expire after 90 days.

## The salt

Set `ANALYTICS_SALT` to a long random string and never change it: changing
it starts every visitor over. Without it, the package derives a salt from the
database url, so rotating that url has the same effect. That fallback is there
so a missing variable doesn't break anything, but you shouldn't rely on it.

## Limits

- A request body over 4KB is dropped unread.
- One address can send 120 hits a minute and flip the `?analytics` switch 10
  times an hour. This is held in memory per instance.
- The rate-limit memory holds 10,000 addresses; the least recently seen are
  forgotten first.
- A summary folds at most 200,000 rows per window. Past that, the dashboard
  shows the most recent 200,000 and says so.

Posts are only taken from pages on `site` or on the collector's own host.
A request with no `Origin` (curl, a replayed beacon) is let through to the
rate limit, because browsers always send `Origin` on a POST and nothing else
has to.

## A private dashboard

Leave `public` off and set `token`. The page and the route both answer 404
without it. In a browser, open `/analytics?token=…`. A real login is on the
list of things the package might grow, but for now the token is the only gate.
