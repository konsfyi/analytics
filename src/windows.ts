// The windows the dashboard can show: which ones, in what order, how many.
// A site picks them once, on the server (`createAnalytics({ windows })`), and
// the server sends the list along with every set of numbers, so the tabs the
// dashboard draws are always the windows the server will answer — there is no
// second list in the page to keep in step with the first.
//
// A window is a preset by name, or one of your own: a key, a label and a
// length. The first window in the list is the page itself; every other one
// has its own query (`?week`, `?month` … for the presets, `?window=<key>` for
// your own), so a window can be linked to.

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** A window as the dashboard and the report route use it. */
export type WindowSpec = {
  /** What identifies it: in code, and on a phone where the label won't fit. */
  key: string;
  /** What its tab says. */
  label: string;
  /** How far back it reaches, in ms. */
  ms: number;
  /** Its part of the URL: "" for the first window, `?…` for the rest. */
  query: string;
};

/** A window's key. Any string: the windows are whatever the site configured. */
export type Window = string;

/** The ready-made windows, by key. */
export const WINDOW_PRESETS = {
  "24h": { label: "24 hours", ms: 24 * HOUR, query: "?day" },
  "7d": { label: "7 days", ms: 7 * DAY, query: "?week" },
  "30d": { label: "30 days", ms: 30 * DAY, query: "?month" },
  "90d": { label: "90 days", ms: 90 * DAY, query: "?quarter" },
  "12m": { label: "12 months", ms: 365 * DAY, query: "?year" },
} as const satisfies Record<string, Omit<WindowSpec, "key">>;

export type WindowPreset = keyof typeof WINDOW_PRESETS;

/** What `windows` takes: a preset's key, or a window of your own. */
export type WindowOption =
  | WindowPreset
  | { key: string; label: string; ms: number };

/** The windows when none are configured. */
export const DEFAULT_WINDOWS: WindowPreset[] = ["24h", "7d", "30d"];

/** How many tabs a dashboard will draw. Past this it is a menu, not tabs. */
export const MAX_WINDOWS = 8;

const KEY = /^[a-z0-9-]{1,20}$/i;

/**
 * The configured windows, checked and in order, each with its query. Throws on
 * a list that cannot work — an unknown preset, a repeated key, a window with
 * no length — so a mistake shows up when the server starts, not as a tab that
 * quietly shows the wrong numbers.
 */
export function resolveWindows(
  list: readonly WindowOption[] = DEFAULT_WINDOWS,
): WindowSpec[] {
  if (!list.length) throw new Error("analytics: windows is empty");
  if (list.length > MAX_WINDOWS)
    throw new Error(`analytics: at most ${MAX_WINDOWS} windows`);
  const seen = new Set<string>();
  return list.map((w, i) => {
    let spec: WindowSpec;
    if (typeof w === "string") {
      const preset = (WINDOW_PRESETS as Record<string, Omit<WindowSpec, "key">>)[w];
      if (!preset)
        throw new Error(
          `analytics: no window called "${w}" — the presets are ${Object.keys(WINDOW_PRESETS).join(", ")}`,
        );
      spec = { key: w, ...preset };
    } else {
      if (!KEY.test(w.key))
        throw new Error(
          `analytics: window key "${w.key}" — letters, digits and dashes only`,
        );
      if (!(w.ms > 0)) throw new Error(`analytics: window "${w.key}" has no length`);
      spec = { key: w.key, label: w.label, ms: w.ms, query: `?window=${w.key}` };
    }
    if (seen.has(spec.key))
      throw new Error(`analytics: window "${spec.key}" is listed twice`);
    seen.add(spec.key);
    // The first window is the page itself.
    return i === 0 ? { ...spec, query: "" } : spec;
  });
}

/**
 * Which window a URL asks for — `?window=<key>`, a preset's own flag
 * (`?week`, `?month` …), or else the first window. Anything the site does not
 * show falls back to the first, so an old link never breaks the page.
 */
export function windowOf(
  search: string | Record<string, unknown>,
  windows: readonly Pick<WindowSpec, "key" | "query">[] = resolveWindows(),
): Window {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search)
      : new URLSearchParams(
          Object.entries(search).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
        );
  const asked = params.get("window");
  if (asked) {
    const hit = windows.find((w) => w.key === asked);
    if (hit) return hit.key;
  }
  for (const w of windows) {
    const flag = w.query.match(/^\?([a-z]+)$/i)?.[1];
    if (flag && params.has(flag)) return w.key;
  }
  return windows[0].key;
}
