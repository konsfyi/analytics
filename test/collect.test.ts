import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { RATE } from "../src/config.js";
import { createAnalytics, type AnalyticsServer } from "../src/server/index.js";
import type { Hit } from "../src/types.js";

// The endpoint, end to end, against the file store — which is what makes this
// worth writing: every one of these is a request no browser would send, and the
// collector has to be right about all of them because it is the one part of the
// tool that anybody at all can reach.
//
// It never answers anything but 204, so what a test asserts is what ended up in
// the log, not what came back.

const DIR = process.env.ANALYTICS_DIR as string;
const SITE = "example.com";
const LOG = join(DIR, "analytics.jsonl");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function rows(): Hit[] {
  try {
    return readFileSync(LOG, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Hit);
  } catch {
    return [];
  }
}

// A fresh instance per test: its own rate limit, the same file store.
let analytics: AnalyticsServer;

let seq = 0;
/** One post, from its own address so the rate limit never bleeds between tests. */
function post(
  body: unknown,
  headers: Record<string, string> = {},
  from = `10.0.0.${++seq}`,
) {
  return analytics.collect(
    new Request(`https://${SITE}/api/hit`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": UA,
        origin: `https://${SITE}`,
        "x-forwarded-for": from,
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const view = { kind: "view", path: "/canvas-card", visit: "v1", width: 1512 };

describe("collect", () => {
  beforeEach(() => {
    analytics = createAnalytics({ site: SITE });
  });

  it("records a view, and works everything else out itself", async () => {
    const before = rows().length;
    const res = await post(view, {
      "x-vercel-ip-country": "DE",
      referer: "https://t.co/abc",
    });
    expect(res.status).toBe(204);

    const hit = rows().at(-1) as Hit;
    expect(rows().length).toBe(before + 1);
    expect(hit).toMatchObject({
      kind: "view",
      path: "/canvas-card",
      visit: "v1",
      country: "DE",
      channel: "social",
      source: "t.co",
      device: "Desktop",
      os: "macOS",
      browser: "Chrome",
      screen: "1440 – 1920",
    });
    // Nothing that is anyone: a hash, and not one that holds until tomorrow.
    expect(hit.visitor).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(hit)).not.toContain("10.0.0.");
    expect(JSON.stringify(hit)).not.toContain("Mozilla");
  });

  it("gives two people different ids and one person the same one", async () => {
    await post({ ...view, visit: "x" }, {}, "10.1.1.1");
    await post({ ...view, visit: "y" }, {}, "10.1.1.1");
    await post({ ...view, visit: "z" }, {}, "10.1.1.2");
    const [a, b, c] = rows().slice(-3);
    expect(a.visitor).toBe(b.visitor);
    expect(a.visitor).not.toBe(c.visitor);
  });

  it("turns away a bot without a word", async () => {
    const before = rows().length;
    await post(view, {
      "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    });
    expect(rows().length).toBe(before);
  });

  it("turns away a post from somebody else's page", async () => {
    const before = rows().length;
    await post(view, { origin: "https://someone-else.example" });
    expect(rows().length).toBe(before);
  });

  it("takes a post from the named site when the collector lives elsewhere", async () => {
    const before = rows().length;
    await analytics.collect(
      new Request("https://collector.example.net/api/hit", {
        method: "POST",
        headers: {
          "user-agent": UA,
          origin: `https://${SITE}`,
          "x-forwarded-for": "10.2.2.2",
        },
        body: JSON.stringify({ ...view, ref: `https://${SITE}/` }),
      }),
    );
    expect(rows().length).toBe(before + 1);
    // moving around the named site is not a visit from somewhere
    expect(rows().at(-1)?.channel).toBe("direct");
  });

  it("turns away a body too big to be a beacon", async () => {
    const before = rows().length;
    await post({ ...view, data: { fill: "x".repeat(LIMIT_OVER) } });
    expect(rows().length).toBe(before);
  });

  it("turns away nonsense without falling over", async () => {
    const before = rows().length;
    await post("{ not json at all");
    await post({ kind: "view" });
    await post([1, 2, 3]);
    expect(rows().length).toBe(before);
  });

  it("stops one address flooding the log", async () => {
    const before = rows().length;
    for (let i = 0; i < RATE.hits + 30; i++)
      await post({ ...view, visit: `flood-${i}` }, {}, "10.9.9.9");
    expect(rows().length - before).toBe(RATE.hits);
  });

  it("stops counting a device that asked to be left out, and starts again", async () => {
    const who = "10.5.5.5";
    await post({ set: "off" }, {}, who);
    const quiet = rows().length;
    await post({ ...view, visit: "muted" }, {}, who);
    expect(rows().length).toBe(quiet);

    // somebody else is unaffected by it
    await post({ ...view, visit: "other" }, {}, "10.5.5.6");
    expect(rows().length).toBe(quiet + 1);

    await post({ set: "on" }, {}, who);
    await post({ ...view, visit: "back" }, {}, who);
    expect(rows().at(-1)?.visit).toBe("back");
  });

  it("keeps the detail an event carries, within reason", async () => {
    await post({
      kind: "event",
      path: "/canvas-card",
      visit: "e1",
      name: "copy-code",
      data: { file: "canvas-card.tsx", lines: 420, whole: true, deep: { no: 1 } },
    });
    const hit = rows().at(-1) as Hit;
    expect(hit.name).toBe("copy-code");
    expect(hit.data).toEqual({
      file: "canvas-card.tsx",
      lines: 420,
      whole: true,
    });
  });
});

// Comfortably past the body cap, whatever it is set to.
const LIMIT_OVER = 8 * 1024;
