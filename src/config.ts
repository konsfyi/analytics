// What every part of the tool agrees on: limits and constants, nothing read
// from the environment — the dashboard imports this, and it has to run in any
// browser. The settings that differ from site to site are options, passed to
// createAnalytics() on the server and to the tracker in the page.

// What the collector will take in one beacon. Everything is capped: a hit is a
// few hundred bytes of known shape, and anything larger is either a mistake or
// somebody having a go at the endpoint.
export const LIMITS = {
  /** The whole request body. A real beacon is under 400 bytes. */
  body: 4 * 1024,
  path: 200,
  visit: 40,
  name: 60,
  /** `data` on an event: how many keys, and how long each part may be. */
  dataKeys: 10,
  dataKey: 40,
  dataValue: 200,
  /** The longest a reported visit may claim to have been. */
  visitMs: 6 * 3600_000,
} as const;

// How much one address may do. Held in memory per server instance, so on a
// platform that runs several of them the real ceiling is this times the number
// of instances — which is fine: the point is to make a flood expensive, not to
// meter anyone exactly.
export const RATE = {
  /** Hits per address per minute. A person reading quickly sends maybe ten. */
  hits: 120,
  hitWindow: 60_000,
  /** ?analytics=off / =on per address per hour. Nobody needs a second one. */
  switches: 10,
  switchWindow: 3600_000,
  /** Addresses remembered at once; the oldest go first. */
  keys: 10_000,
} as const;

/**
 * The most rows one window will fold into a summary. Aggregating in memory is
 * the whole design — one implementation, every store, no SQL to keep in step —
 * and this is the price of it: past this many hits in a window the numbers are
 * worked out from the most recent ones and the dashboard says so, rather than
 * the page quietly taking longer and longer until it stops answering.
 */
export const MAX_ROWS = 200_000;

/** How long a device that asked not to be counted stays uncounted. */
export const MUTE_DAYS = 90;
