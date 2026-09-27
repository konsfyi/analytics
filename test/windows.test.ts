import { describe, expect, it } from "vitest";
import { createAnalytics } from "../src/server/index.js";
import { resolveWindows, windowOf } from "../src/windows.js";

// The windows are the site's to choose: which, in what order, how many. What
// has to hold is that the tabs, the URL and the numbers always agree, and that
// a list that cannot work says so at once rather than showing wrong figures.

const DAY = 86_400_000;

describe("the windows", () => {
  it("defaults to a day, a week and a month, the first being the page itself", () => {
    const w = resolveWindows();
    expect(w.map((x) => x.key)).toEqual(["24h", "7d", "30d"]);
    expect(w.map((x) => x.query)).toEqual(["", "?week", "?month"]);
  });

  it("takes presets and windows of your own, in the order given", () => {
    const w = resolveWindows(["7d", { key: "2w", label: "2 weeks", ms: 14 * DAY }, "12m"]);
    expect(w.map((x) => [x.key, x.label, x.query])).toEqual([
      ["7d", "7 days", ""],
      ["2w", "2 weeks", "?window=2w"],
      ["12m", "12 months", "?year"],
    ]);
  });

  it("refuses a list that cannot work", () => {
    expect(() => resolveWindows([])).toThrow(/empty/);
    expect(() => resolveWindows(["5y" as never])).toThrow(/no window called "5y"/);
    expect(() => resolveWindows(["7d", "7d"])).toThrow(/twice/);
    expect(() => resolveWindows([{ key: "x", label: "X", ms: 0 }])).toThrow(/no length/);
    expect(() => resolveWindows([{ key: "a b", label: "X", ms: DAY }])).toThrow(/letters/);
    expect(() => resolveWindows(Array(9).fill(0).map((_, i) => ({ key: `w${i}`, label: "", ms: DAY })))).toThrow(/at most/);
  });

  it("reads the URL against the site's own list, and falls back to the first", () => {
    const w = resolveWindows(["24h", "90d", { key: "2w", label: "2 weeks", ms: 14 * DAY }]);
    expect(windowOf("?quarter", w)).toBe("90d");
    expect(windowOf("?window=2w", w)).toBe("2w");
    expect(windowOf("?window=90d", w)).toBe("90d");
    expect(windowOf({ quarter: "" }, w)).toBe("90d");
    // not shown on this site: the first window, never an error
    expect(windowOf("?month", w)).toBe("24h");
    expect(windowOf("?window=nope", w)).toBe("24h");
    expect(windowOf("", w)).toBe("24h");
  });
});

describe("the windows, through the server", () => {
  const make = (windows?: NonNullable<Parameters<typeof createAnalytics>[0]>["windows"]) =>
    createAnalytics({ public: true, windows });

  it("sends its list with the numbers, and answers only windows on it", async () => {
    const a = make(["24h", "90d"]);
    const res = await a.report(new Request("https://e.com/api/analytics?quarter"));
    const n = await res.json();
    expect(n.window).toBe("90d");
    expect(n.windows).toEqual([
      { key: "24h", label: "24 hours", query: "" },
      { key: "90d", label: "90 days", query: "?quarter" },
    ]);
    expect(Date.now() - n.from).toBeGreaterThan(89 * DAY);
    // a window this site doesn't show is the first one
    const month = await (await a.report(new Request("https://e.com/api/analytics?month"))).json();
    expect(month.window).toBe("24h");
  });

  it("numbers() takes a key, and an unknown one gets the first window", async () => {
    const a = make([{ key: "2w", label: "2 weeks", ms: 14 * DAY }, "30d"]);
    expect((await a.numbers("30d")).window).toBe("30d");
    expect((await a.numbers("nope")).window).toBe("2w");
    expect((await a.numbers()).window).toBe("2w");
    expect(a.windowOf("?month")).toBe("30d");
  });

  it("reads preset keys from ANALYTICS_WINDOWS", async () => {
    process.env.ANALYTICS_WINDOWS = "30d, 12m";
    try {
      const n = await createAnalytics({ public: true }).numbers();
      expect(n.windows.map((w) => w.key)).toEqual(["30d", "12m"]);
    } finally {
      delete process.env.ANALYTICS_WINDOWS;
    }
  });
});
