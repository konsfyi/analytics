import { describe, expect, it } from "vitest";
import { duration, summarize } from "../src/summary.js";
import type { Hit } from "../src/types.js";

// The arithmetic. Everything the dashboard shows comes out of one function over
// a list of rows, so a synthetic log with answers worked out by hand is the
// whole test — and it is where the definitions live: what counts as a bounce,
// why a visit has a median rather than a mean, and which figures belong to a
// visit rather than to a view.

const HOUR = 3600_000;
const DAY = 86_400_000;

let n = 0;
function hit(over: Partial<Hit> & { visit: string; ts: number }): Hit {
  return {
    kind: "view",
    path: "/",
    visitor: `who-${over.visit}`,
    channel: "direct",
    source: null,
    country: "DE",
    device: "Desktop",
    screen: "1440 – 1920",
    os: "macOS",
    browser: "Chrome",
    ...over,
    // every row is distinct even when two share a millisecond
    ts: over.ts + (n++ % 3),
  } as Hit;
}

describe("summarize", () => {
  const to = Date.UTC(2026, 8, 20, 12, 0, 0);
  const from = to - DAY;

  it("counts views, visits and visitors apart from one another", () => {
    const hits = [
      // one visit, three pages
      hit({ visit: "a", ts: from + HOUR, path: "/" }),
      hit({ visit: "a", ts: from + HOUR + 1000, path: "/canvas-card" }),
      hit({ visit: "a", ts: from + HOUR + 2000, path: "/colors" }),
      // a second visit by the same person, later the same day
      hit({ visit: "b", ts: from + 5 * HOUR, visitor: "who-a" }),
      // somebody else
      hit({ visit: "c", ts: from + 6 * HOUR }),
    ];
    const s = summarize(hits, from, to);
    expect(s.views).toBe(5);
    expect(s.visits).toBe(3);
    expect(s.visitors).toBe(2);
  });

  it("counts where a visit came from once, not once per page of it", () => {
    // The bug this pins: tallying the channel of every view made someone who
    // arrived from a link and read five pages into one referral and four direct
    // visits, and "direct" became half the dashboard.
    const hits = [
      hit({ visit: "a", ts: from + HOUR, channel: "social", source: "t.co" }),
      hit({ visit: "a", ts: from + HOUR + 1000, channel: "direct", source: null }),
      hit({ visit: "a", ts: from + HOUR + 2000, channel: "direct", source: null }),
      hit({ visit: "b", ts: from + 2 * HOUR, channel: "search", source: "google.com" }),
    ];
    const s = summarize(hits, from, to);
    expect(s.channels).toEqual([
      { label: "search", count: 1, share: 50 },
      { label: "social", count: 1, share: 50 },
    ]);
    // pages, though, are per view — a page is exactly the thing a view is
    expect(s.pages[0].count).toBe(4);
  });

  it("gives a referrer its share of every visit, not only referred ones", () => {
    const hits = [
      hit({ visit: "a", ts: from + HOUR, channel: "social", source: "t.co" }),
      hit({ visit: "b", ts: from + 2 * HOUR }),
      hit({ visit: "c", ts: from + 3 * HOUR }),
      hit({ visit: "d", ts: from + 4 * HOUR }),
    ];
    const s = summarize(hits, from, to);
    // one visit in four came from t.co: 25%, not the 100% of referred visits
    expect(s.sources).toEqual([{ label: "t.co", count: 1, share: 25 }]);
  });

  it("is a bounce when one page was seen and nothing happened for long", () => {
    const hits = [
      // looked once and left
      hit({ visit: "a", ts: from + HOUR }),
      // looked once but stayed a while
      hit({ visit: "b", ts: from + 2 * HOUR }),
      hit({ kind: "end", visit: "b", ts: from + 2 * HOUR + 60_000, ms: 60_000 }),
      // read two pages
      hit({ visit: "c", ts: from + 3 * HOUR }),
      hit({ visit: "c", ts: from + 3 * HOUR + 5000, path: "/colors" }),
    ];
    const s = summarize(hits, from, to);
    expect(s.visits).toBe(3);
    expect(s.bounce).toBe(33.3);
  });

  it("takes the middle visit's length, and caps one left open", () => {
    const hits = [
      hit({ visit: "a", ts: from + HOUR }),
      hit({ kind: "end", visit: "a", ts: from + HOUR, ms: 10_000 }),
      hit({ visit: "b", ts: from + 2 * HOUR }),
      hit({ kind: "end", visit: "b", ts: from + 2 * HOUR, ms: 40_000 }),
      // a tab forgotten for an afternoon. A mean would make this the whole
      // figure; the median ignores it and the cap stops it being hours.
      hit({ visit: "c", ts: from + 3 * HOUR }),
      hit({ kind: "end", visit: "c", ts: from + 3 * HOUR, ms: 5 * HOUR }),
    ];
    const s = summarize(hits, from, to);
    expect(s.time).toBe(40); // seconds: the middle of 10s, 40s, capped 30m
  });

  it("starts the chart at a whole step, so the first column is a real one", () => {
    // A window that begins at half past: the hour it lands in started before
    // the window did, so counting it would always read low — a quiet patch at
    // the left of every chart that was never there.
    const odd = to - DAY + 30 * 60_000;
    const s = summarize([hit({ visit: "a", ts: to - HOUR })], odd, to);
    expect(s.series[0].at % HOUR).toBe(0);
    expect(s.series[0].at).toBeGreaterThanOrEqual(odd);
  });

  it("reads a day by the hour and a month by the day", () => {
    const day = summarize([], to - DAY, to);
    const month = summarize([], to - 30 * DAY, to);
    expect(day.series.length).toBeGreaterThan(20);
    expect(month.series.length).toBeGreaterThan(28);
    expect(month.series[1].at - month.series[0].at).toBe(DAY);
    const quarter = summarize([], to - 90 * DAY, to);
    expect(quarter.series.length).toBeGreaterThan(88);
    expect(quarter.series[1].at - quarter.series[0].at).toBe(DAY);
    const year = summarize([], to - 365 * DAY, to);
    expect(year.series[1].at - year.series[0].at).toBe(7 * DAY);
  });

  it("counts events by name, and only events", () => {
    const hits = [
      hit({ visit: "a", ts: from + HOUR }),
      hit({ kind: "event", visit: "a", ts: from + HOUR, name: "copy-code" }),
      hit({ kind: "event", visit: "a", ts: from + HOUR, name: "copy-code" }),
      hit({ kind: "event", visit: "b", ts: from + HOUR, name: "code" }),
    ];
    const s = summarize(hits, from, to);
    expect(s.events).toEqual([
      { label: "copy-code", count: 2, share: 66.7 },
      { label: "code", count: 1, share: 33.3 },
    ]);
    expect(s.views).toBe(1);
  });

  it("has an answer for an empty window", () => {
    const s = summarize([], from, to);
    expect(s).toMatchObject({
      views: 0,
      visits: 0,
      visitors: 0,
      bounce: 0,
      time: 0,
    });
    expect(s.pages).toEqual([]);
  });
});

describe("duration", () => {
  it("reads as a person would say it", () => {
    expect(duration(9)).toBe("9s");
    expect(duration(90)).toBe("1m 30s");
    expect(duration(3720)).toBe("1h 2m");
  });
});
