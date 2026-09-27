// What runs anywhere — no server, no browser, no framework: the shapes, the
// arithmetic and the reading of a user agent. The server is in
// `@konsfyi/analytics/server`, the tracker in `/client` (and `/next`), the
// dashboard in `/dashboard`.

export { LIMITS, MAX_ROWS, MUTE_DAYS, RATE } from "./config.js";
export { detail, read as readBeacon } from "./beacon.js";
export {
  address,
  browser,
  channel,
  country,
  device,
  isBot,
  os,
  screen,
  source,
  type Channel,
  type HeaderReader,
} from "./parse.js";
export { duration, summarize, type Count, type Summary } from "./summary.js";
export type { Beacon, Hit, HitKind, Numbers } from "./types.js";
export { WINDOWS, WINDOW_KEYS, windowOf, type Window } from "./windows.js";
