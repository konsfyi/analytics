import { summarize } from "../summary.js";
import type { Numbers } from "../types.js";
import { windowOf, type Window } from "../windows.js";
import { mayRead } from "./gate.js";
import type { Log } from "./log.js";
import type { Settings } from "./settings.js";

// The other half of the server: the numbers. A Request in, a Response out, so
// the route above it is one line — and a page that renders the first set on
// the server calls numbers() directly rather than going through HTTP to reach
// itself.

export function reporter(settings: Settings, log: Log) {
  /** The window a URL asks for, among the ones this site shows. */
  const pick = (search: string | Record<string, unknown>): Window =>
    windowOf(search, settings.windows());

  /**
   * The figures for one window, worked out now. A key the site does not show
   * gets the first window — never an error, never a window nobody configured.
   */
  async function numbers(key?: Window): Promise<Numbers> {
    const windows = settings.windows();
    const spec = windows.find((w) => w.key === key) ?? windows[0];
    const now = Date.now();
    const from = now - spec.ms;
    const { hits, capped } = await log.read(from);
    return {
      from,
      capped,
      summary: summarize(hits, from, now),
      window: spec.key,
      windows: windows.map(({ key, label, query }) => ({ key, label, query })),
    };
  }

  /**
   * The numbers over HTTP, for the dashboard to ask again without a
   * navigation — which is what lets it move the bars rather than redraw them.
   * The URL picks the window (`?window=<key>`, or a preset's `?week`,
   * `?month` …); the first configured window is the default.
   *
   * Refused reads are a 404, not a 401: an endpoint that answers "wrong
   * password" has told you there is a password.
   */
  async function report(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (
      !mayRead(
        settings,
        (name) => req.headers.get(name),
        url.searchParams.get("token"),
      )
    )
      return new Response(null, { status: 404 });

    return Response.json(await numbers(pick(url.search)), {
      headers: { "cache-control": "no-store" },
    });
  }

  return { numbers, report, windowOf: pick };
}
