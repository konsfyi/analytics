import type { Channel } from "./parse.js";
import type { Summary } from "./summary.js";

// One row of the log. Every hit is the same shape whatever it records — a page
// view, the end of a visit (which carries how long it lasted), or an event
// fired from the page. No cookies and no addresses: a visitor is a hash that
// changes every day, a visit is an id the tab keeps for as long as it is open.

export type HitKind = "view" | "end" | "event";

export type Hit = {
  /** ms since epoch, set on the server — a client clock can be anything. */
  ts: number;
  kind: HitKind;
  /** The page it happened on. */
  path: string;
  /** The visit (one tab, until it is closed). */
  visit: string;
  /** Who, as far as we ever know: a hash that is different tomorrow. */
  visitor: string;
  channel: Channel;
  /** The referring host, without www — null when there is none. */
  source: string | null;
  country: string | null;
  device: string;
  screen: string;
  os: string;
  browser: string;
  /** "end" only: how long the visit lasted, in ms. */
  ms?: number;
  /** "event" only: what happened, and anything worth keeping with it. */
  name?: string;
  data?: Record<string, string | number | boolean> | null;
};

/** What the page sends; everything else is worked out on the server. */
export type Beacon = {
  kind: HitKind;
  /** ?analytics=off / =on: not a hit at all, but the switch being set. When
      this is here nothing else is read — see server/collect.ts. */
  set?: "off" | "on";
  path: string;
  visit: string;
  ref?: string | null;
  /** The window's width — which is the screen bucket, and half of "phone". */
  width?: number;
  ms?: number;
  name?: string;
  data?: Record<string, string | number | boolean> | null;
};

/** One window's figures, as the report route serves them and the dashboard
    draws them. */
export type Numbers = {
  /** Where the window starts, ms since epoch. */
  from: number;
  /** Whether the window held more rows than one summary folds (MAX_ROWS). */
  capped: boolean;
  summary: Summary;
  /** The window these figures are for. */
  window: string;
  /** Every window the site shows, in order — what the dashboard draws as tabs. */
  windows: { key: string; label: string; query: string }[];
};
