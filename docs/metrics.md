# What the numbers mean

Every figure comes out of one function, `summarize(hits, from, to)`, over the
rows of one window. The windows are the last 24 hours (`/analytics`), 7 days
(`?week`), 30 days (`?month`) and 90 days (`?quarter`).

## The tiles

- **Visitors**: distinct visitor ids among the views. The id changes every
  day, so over 7, 30 or 90 days this counts **person-days**: someone who came on
  three days counts three times. Plausible and Umami make the same trade.
- **Views**: page views.
- **Visits**: distinct visit ids among all hits. A visit is one tab, from its
  first view until it is closed.
- **Bounce**: the share of visits that saw **one page and lasted under ten
  seconds**. A one-page visit that was read for longer is not a bounce. This is
  stricter than most tools, which count every one-page visit.
- **Visit time**: the **median** visit length, with each visit capped at 30
  minutes. A visit's length is what the page reported when it went away
  (foreground time only; a tab in the background isn't being read), or, with
  no report, the span between its first and last hit.

## The chart

Views per hour for the 24-hour window, per day for the longer two. The first
column is the first whole hour (or day) inside the window, so the leftmost
column is never a partial one.

## The lists

Each row shows a count and a share.

- **Pages** and **Events** are counted per view and per event.
- **Channels, Referrers, Countries, Devices, Systems, Browsers, Screens** are
  counted **per visit**, from the visit's first view. Someone who arrives from
  a link and reads five pages came from that link once.
- **Referrers**' shares are out of **every** visit, including direct ones, so
  a referrer at 25% brought a quarter of all visits. They don't add up to 100%;
  the rest arrived without a referrer.
- **Channels** are `direct` (no referrer, or one from the site itself),
  `search`, `social` or `referral`, decided by matching the referring host
  against two lists in `parse.ts`.
- **Events** are counted by name. The detail an event carries is stored with
  it but not shown on the dashboard.

## The cap

A window folds at most 200,000 rows. Past that, the figures are worked out
from the most recent 200,000 and the footer says so. They should then be read
as a floor, not a total.
