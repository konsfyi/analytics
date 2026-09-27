# Privacy

What the package stores, what it doesn't, and where the claim has limits.

## What the page sends

Five fields: the kind of hit (`view`, `end` or `event`), the page path, a
visit id, the referrer (first view only), and the window's width. An `end`
also carries how long the visit lasted. An `event` carries its name and up to
ten small values.

The visit id is random and lives in `sessionStorage`. It dies with the tab and
is never sent anywhere else. There are no cookies.

## What the server works out, and what it keeps

From the request, the server works out the channel and referring host (from
the referrer), the country (from a header the platform sets), the device,
system and browser (from the user agent), and a screen-size bucket (from the
width). It keeps those, the path, the visit id, a timestamp, and a
**visitor id**.

The visitor id is the first 16 hex characters of
`sha256(salt : date : address : user agent)`. Because the date is in it, the
same person has a different id tomorrow. It can't be turned back into an
address.

The address and the user agent themselves are never stored.

## The one exception: the off switch

`?analytics=off` stores a hash of `salt : "device" : address : user agent`,
with no date in it, so the device stays uncounted across days. This is the
only thing in the log that outlives the day. It is kept for 90 days, and
nothing else is ever written with it.

## Where the claim has limits

- **The salt is the anonymity.** With the salt, anyone who has an address and
  a user agent can compute that visitor's id for a given day and check whether
  it appears in your rows. Keep the salt secret, keep the rows private if the
  salt could leak, and never use a salt that is published anywhere, including
  in a repo.
- **Within a day, a visitor is linkable.** All of one person's visits on one
  day share an id. That's what makes "visitors" countable.
- **Event detail is whatever you put in it.** The package limits its size and shape,
  not its content. Don't put anything personal in `track()`.
- **Rows are kept for good.** The package never deletes hits. If you need a
  retention period, delete old rows from `hit` yourself; nothing depends on
  them.
- **A public dashboard is public.** The figures carry no names or addresses,
  but paths and event names are yours to choose. Anything in a URL on your
  site can appear there.

## Who is not counted

- Browsers with Do Not Track on.
- Any browser switched off with `?analytics=off`, and the device it's on.
- Anything that isn't the configured site (localhost and previews), unless
  switched on with `?analytics=on`.
- User agents that call themselves a bot, crawler, spider, preview, headless
  browser, Lighthouse, a monitor, curl, wget, or a common HTTP library.
