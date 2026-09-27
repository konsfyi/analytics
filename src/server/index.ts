import { limiter } from "./limit.js";
import { collector } from "./collect.js";
import { mayRead } from "./gate.js";
import { log } from "./log.js";
import { reporter } from "./report.js";
import { settings, type Options } from "./settings.js";

// The server, whole: one call, and everything it hands back is a plain
// function — two of them `(Request) => Promise<Response>`, which is what every
// framework worth the name can mount.
//
//   const analytics = createAnalytics({ site: "example.com" });
//   export const POST = analytics.collect;   // the one endpoint
//   export const GET = analytics.report;     // the numbers, for the dashboard
//
// Each call is its own instance: its own rate limit, its own store, its own
// settings. Make one per process and share it.

export function createAnalytics(options: Options = {}) {
  const set = settings(options);
  const rows = log(set, options.store);
  const limit = limiter();
  const { numbers, report } = reporter(set, rows);

  return {
    /** POST: one beacon in, always 204 out. Mount it where the tracker posts. */
    collect: collector(set, rows, limit),
    /** GET: one window's numbers as JSON, behind the read gate. */
    report,
    /** One window's numbers, for a page that renders the first set itself. */
    numbers,
    /**
     * Whether a request may see the numbers — for a page to check before it
     * renders the dashboard. Give it a header reader and the `?token=` value.
     */
    mayRead: (
      header: (name: string) => string | null | undefined,
      token?: string | null,
    ) => mayRead(set, header, token),
    /** What the store in use is called ("database", "local file"). */
    backend: rows.backend,
    /** The store itself, for anyone who wants the rows. */
    store: rows.store,
  };
}

export type AnalyticsServer = ReturnType<typeof createAnalytics>;
export type { Options } from "./settings.js";
export type { Store } from "../stores/store.js";
export { fileStore } from "../stores/file.js";
export { neonStore } from "../stores/neon.js";
export { postgresStore } from "../stores/postgres.js";
export { sqlStore, type Exec, type Row } from "../stores/sql.js";
