// The four windows the dashboard reads, shared by the page, the route that
// serves the numbers and the dashboard itself. A day is the page as it stands;
// the longer three say so in the URL.

export const WINDOWS = {
  "24h": { label: "24 hours", ms: 24 * 3600_000, query: "" },
  "7d": { label: "7 days", ms: 7 * 86_400_000, query: "?week" },
  "30d": { label: "30 days", ms: 30 * 86_400_000, query: "?month" },
  "90d": { label: "90 days", ms: 90 * 86_400_000, query: "?quarter" },
} as const;

export type Window = keyof typeof WINDOWS;
export const WINDOW_KEYS = Object.keys(WINDOWS) as Window[];

/** The window a URL asks for: ?quarter, ?month, ?week, or the page itself. */
export const windowOf = (search: string | Record<string, unknown>): Window => {
  const has =
    typeof search === "string"
      ? (k: string) => new URLSearchParams(search).has(k)
      : (k: string) => k in search;
  return has("quarter")
    ? "90d"
    : has("month")
      ? "30d"
      : has("week")
        ? "7d"
        : "24h";
};
