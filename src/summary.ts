import type { Hit } from "./types.js";

// The numbers, worked out from the rows of one window. Nothing here touches a
// store or a request — give it hits, it gives you the dashboard.

export type Count = { label: string; count: number; share: number };
export type Summary = {
  views: number;
  visitors: number;
  visits: number;
  /** Visits that saw one page and went, as a percentage of all visits. */
  bounce: number;
  /** The middle visit's length, in seconds — not the mean: one tab left open
      for an afternoon would otherwise be the whole figure. */
  time: number;
  /** Views per day (or per hour for the 24h window), oldest first. */
  series: { at: number; views: number; visitors: number }[];
  pages: Count[];
  channels: Count[];
  sources: Count[];
  countries: Count[];
  devices: Count[];
  screens: Count[];
  systems: Count[];
  browsers: Count[];
  events: Count[];
};

const CAP = 30 * 60_000; // the longest a single visit may count for

// `of` is the denominator a share is a share of. It is usually the list itself,
// but not always: referrers are counted over the visits that had one, while the
// share people read is of every visit — without this, one referrer on a site
// where most visits are direct reads as 100%.
const tally = (
  values: (string | null | undefined)[],
  fallback = "Unknown",
  of?: number,
) => {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v || fallback;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const total = of || values.length || 1;
  return [...map.entries()]
    .map(([label, count]) => ({
      label,
      count,
      share: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

export function summarize(hits: Hit[], from: number, to: number): Summary {
  const views = hits.filter((h) => h.kind === "view");
  const events = hits.filter((h) => h.kind === "event");

  // A visit is one tab from its first view to its last sign of life; its
  // length is whatever the page reported when it went away, and failing that
  // the span of its own hits (a visit of one view and no report lasted 0).
  const visits = new Map<string, { views: number; first: number; last: number; ms: number }>();
  for (const h of hits) {
    const v = visits.get(h.visit) ?? { views: 0, first: h.ts, last: h.ts, ms: 0 };
    if (h.kind === "view") v.views += 1;
    v.first = Math.min(v.first, h.ts);
    v.last = Math.max(v.last, h.ts);
    if (h.kind === "end" && h.ms) v.ms = Math.max(v.ms, h.ms);
    visits.set(h.visit, v);
  }
  // A visit cannot be longer than the cap however it was reported — a clock
  // that jumped, a beacon that arrived late, a page open since yesterday.
  const lengths = [...visits.values()]
    .map((v) => Math.min(v.ms || v.last - v.first, CAP))
    .sort((a, b) => a - b);
  const bounced = [...visits.values()].filter(
    (v) => v.views <= 1 && (v.ms || v.last - v.first) < 10_000,
  ).length;

  // The shape of the window decides the step: a day is read by the hour, a
  // longer stretch by the day.
  const span = to - from;
  const step = span <= 36 * 3600_000 ? 3600_000 : 86_400_000;
  const buckets = new Map<number, { views: number; visitors: Set<string> }>();
  // Start at the first WHOLE step inside the window. The one before it began
  // before `from`, so it can only ever hold the part of an hour (or a day) that
  // falls inside — a first column that always read low and always looked like a
  // quiet patch that was not there.
  const first = Math.ceil(from / step) * step;
  for (let at = first; at < to; at += step)
    buckets.set(at, { views: 0, visitors: new Set() });
  for (const h of views) {
    const at = Math.floor(h.ts / step) * step;
    const b = buckets.get(at);
    if (!b) continue;
    b.views += 1;
    b.visitors.add(h.visitor);
  }

  // Where a visit came from and what it was read on belong to the visit, not
  // to each page of it: someone who arrives from a link and then looks at five
  // pages came from that link once. Counting every view would make each of
  // those five a direct visit of its own — which is how "direct" came to be
  // half of the channels when almost nobody arrives that way. So these are
  // tallied over the first view of every visit; only Pages (and Events) are
  // per view, because a page is exactly the thing a view is.
  const arrivals = new Map<string, Hit>();
  for (const h of views) {
    const held = arrivals.get(h.visit);
    if (!held || h.ts < held.ts) arrivals.set(h.visit, h);
  }
  const arrived = [...arrivals.values()];

  return {
    views: views.length,
    visitors: new Set(views.map((h) => h.visitor)).size,
    visits: visits.size,
    bounce: visits.size ? Math.round((bounced / visits.size) * 1000) / 10 : 0,
    time: lengths.length
      ? Math.round(lengths[Math.floor(lengths.length / 2)] / 1000)
      : 0,
    series: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([at, b]) => ({ at, views: b.views, visitors: b.visitors.size })),
    pages: tally(views.map((h) => h.path)),
    channels: tally(arrived.map((h) => h.channel)),
    // Over every visit, not only the referred ones — see tally().
    sources: tally(
      arrived.filter((h) => h.source).map((h) => h.source),
      "—",
      arrived.length,
    ),
    countries: tally(arrived.map((h) => h.country)),
    devices: tally(arrived.map((h) => h.device)),
    screens: tally(arrived.map((h) => h.screen)),
    systems: tally(arrived.map((h) => h.os)),
    browsers: tally(arrived.map((h) => h.browser)),
    events: tally(events.map((h) => h.name)),
  };
}

/** 90s → "1m 30s", 3720s → "1h 2m". */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
