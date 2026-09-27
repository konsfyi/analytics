import { summarize } from "../summary.js";
import type { Numbers } from "../types.js";
import { WINDOWS, windowOf, type Window } from "../windows.js";
import { mayRead } from "./gate.js";
import type { Log } from "./log.js";
import type { Settings } from "./settings.js";

// The other half of the server: the numbers. A Request in, a Response out, so
// the route above it is one line — and a page that renders the first set on
// the server calls numbers() directly rather than going through HTTP to reach
// itself.

export function reporter(settings: Settings, log: Log) {
  /** The figures for one window, worked out now. */
  async function numbers(key: Window): Promise<Numbers> {
    const now = Date.now();
    const from = now - WINDOWS[key].ms;
    const { hits, capped } = await log.read(from);
    return { from, capped, summary: summarize(hits, from, now) };
  }

  /**
   * The numbers over HTTP, for the dashboard to ask again without a
   * navigation — which is what lets it move the bars rather than redraw them.
   * `?week`, `?month` and `?quarter` pick the window; the day is the default.
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

    return Response.json(await numbers(windowOf(url.search)), {
      headers: { "cache-control": "no-store" },
    });
  }

  return { numbers, report };
}
