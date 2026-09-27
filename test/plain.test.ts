import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dashboard } from "../src/dashboard/dashboard.js";
import { summarize } from "../src/summary.js";
import type { Hit } from "../src/types.js";

// The dashboard as somebody else gets it: their own page, the component dropped
// into it, no host around it and none of a host's tokens — just <Dashboard />
// and the stylesheet it brings. This renders it and writes the page to
// `temp/dashboard.html` so it can be opened and looked at rather than
// imagined.
//
// It is also a real check, which is why it lives here: the standalone dashboard
// has to render on a server with nothing configured, no framework anywhere
// and no host to inherit from, and that is a thing that can break.
//
// Static markup loses nothing of the first paint — the dashboard deliberately
// does not animate until it has been live for a frame, so this is exactly what
// a visitor sees on load. What it cannot show is the next set of numbers
// arriving 30 seconds later, which is when the bars travel and a new row opens
// its own space.

const here = dirname(fileURLToPath(import.meta.url));
const CSS = join(here, "../src/dashboard/dashboard.css");
const OUT = join(here, "../temp/dashboard.html");

const HOUR = 3600_000;

/* A day of traffic for a small site, invented — no real numbers leave the
   database for this, and a preview wants a dashboard with something in it. */
function log(now: number): Hit[] {
  const pages = ["/", "/docs", "/pricing", "/blog/why-no-cookies", "/about"];
  const countries = ["DE", "US", "GB", "FR", "NL", "PL", "ES", "IN"];
  const channels = ["direct", "social", "search", "referral"] as const;
  const sources = [null, "t.co", "google.com", "news.ycombinator.com"];
  const systems = ["macOS", "iOS", "Windows", "Android"];
  const browsers = ["Chrome", "Safari", "X (in-app)", "Firefox", "Edge"];
  const devices = ["Desktop", "Phone", "Tablet"];
  const screens = ["1440 – 1920", "< 480", "1024 – 1440", "768 – 1024"];

  // A fixed shuffle, so the page is the same every time it is generated. The
  // multiplier and modulus are the minimal-standard pair on purpose: anything
  // larger overflows what a double holds exactly and the sequence collapses
  // into a handful of values — which is what "99.4% direct" looks like.
  let seed = 7;
  const next = (n: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  };

  const hits: Hit[] = [];
  for (let v = 0; v < 180; v++) {
    const at = now - next(23) * HOUR - next(59) * 60_000;
    const channel = channels[next(4)];
    const visit = `v${v}`;
    const shared = {
      visit,
      visitor: `who-${next(120)}`,
      channel,
      source: channel === "direct" ? null : sources[1 + next(3)],
      country: countries[next(8)],
      device: devices[next(3)],
      screen: screens[next(4)],
      os: systems[next(4)],
      browser: browsers[next(5)],
    };
    // Two visits in five look at one page and go, which is roughly what a
    // bounce rate of 40% is made of; the rest read two to four.
    const short = next(5) < 2;
    const depth = short ? 1 : 2 + next(3);
    for (let p = 0; p < depth; p++)
      hits.push({ ...shared, kind: "view", ts: at + p * 20_000, path: pages[next(5)] } as Hit);
    hits.push({
      ...shared,
      kind: "end",
      ts: at + depth * 20_000,
      ms: short ? 1000 + next(7000) : 20_000 + next(160_000),
    } as Hit);
    if (next(4) === 0)
      hits.push({
        ...shared,
        kind: "event",
        ts: at + 5000,
        path: pages[next(5)],
        name: ["copy-code", "theme", "open-docs"][next(3)],
      } as Hit);
  }
  return hits.sort((a, b) => a.ts - b.ts);
}

describe("the dashboard on its own", () => {
  it("renders with nothing configured, and leaves the page in temp/", () => {
    const now = Date.UTC(2026, 8, 20, 18, 0, 0);
    const from = now - 24 * HOUR;
    const initial = {
      from,
      capped: false,
      summary: summarize(log(now), from, now),
    };

    const body = renderToStaticMarkup(
      createElement(Dashboard, {
        initial,
        initialWindow: "24h" as const,
        backend: "database",
      }),
    );

    // Everything the dashboard is: its own classes, and no host's.
    expect(body).toContain('class="an-numbers"');
    expect(body).toContain('class="an-header"');
    expect(body).toContain('class="an-tile-value"');
    // and not one class that is not its own
    const classes = [...body.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
      m[1].split(/\s+/),
    );
    expect(classes.filter((c) => c !== "an" && !c.startsWith("an-"))).toEqual([]);

    const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Analytics</title>
<!-- The default --an-font is Inter; a page without it falls back to system-ui.
     Loaded here so the default is seen as it is meant to be. -->
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
/* Everything the host page has. No reset, no framework, no tokens — the
   dashboard brings the rest of it itself. */
body { margin: 0; background: #fff; -webkit-font-smoothing: antialiased; }
</style>
<style>
${readFileSync(CSS, "utf8")}
</style>
</head>
<body>${body}</body>
</html>
`;
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, page, "utf8");
  });
});
