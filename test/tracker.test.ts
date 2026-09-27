// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The tracker, in a page. What matters is who it leaves out — a site's owner,
// Do Not Track, the dev server — because a tracker that counts too much is the
// one failure nobody notices, and what it sends, because the collector only
// believes what it can check.

type Sent = { url: string; body: Record<string, unknown> };
let sent: Sent[] = [];

async function load(host = "example.com", search = "") {
  vi.resetModules(); // a fresh tracker: the state it keeps is per page
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(
    `https://${host}/docs${search}`,
  );
  localStorage.clear();
  sessionStorage.clear();
  return import("../src/client/tracker.js");
}

beforeEach(() => {
  sent = [];
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (url: string, blob: Blob) => {
      void blob.text().then((text) => sent.push({ url, body: JSON.parse(text) }));
      return true;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 204 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("the tracker", () => {
  it("sends a view with the page, its visit and the width, and nothing else", async () => {
    const t = await load();
    t.configure({ site: "example.com" });
    t.pageview("/docs");
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/hit");
    expect(Object.keys(sent[0].body).sort()).toEqual(["kind", "path", "ref", "visit", "width"]);
    expect(sent[0].body).toMatchObject({ kind: "view", path: "/docs" });
  });

  it("keeps one visit id for the tab", async () => {
    const t = await load();
    t.configure({ site: "example.com" });
    t.pageview("/a");
    t.pageview("/b");
    await settle();
    expect(sent[0].body.visit).toBe(sent[1].body.visit);
  });

  it("does not count anywhere that is not the site", async () => {
    const t = await load("localhost");
    t.configure({ site: "example.com" });
    t.pageview("/docs");
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("does not count localhost when no site is named", async () => {
    const t = await load("localhost");
    t.configure({});
    t.pageview("/docs");
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("honours Do Not Track", async () => {
    const t = await load();
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
    t.configure({ site: "example.com" });
    t.pageview("/docs");
    await settle();
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: null });
    expect(sent).toHaveLength(0);
  });

  it("?analytics=off keeps the browser out, and tells the server", async () => {
    const t = await load("example.com", "?analytics=off");
    t.configure({ site: "example.com", prefix: "mine" });
    t.applySwitch();
    expect(localStorage.getItem("mine:analytics")).toBe("off");
    t.pageview("/docs");
    await settle();
    expect(sent).toEqual([{ url: "/api/hit", body: { set: "off" } }]);
  });

  it("counts a remount once, not twice", async () => {
    const t = await load();
    t.configure({ site: "example.com" });
    t.pageview("/docs");
    t.pageview("/docs");
    await settle();
    expect(sent).toHaveLength(1);
  });

  it("start() counts the routes of a single-page app", async () => {
    const t = await load();
    const stop = t.start({ site: "example.com", endpoint: "/hit" });
    history.pushState(null, "", "/pricing");
    history.pushState(null, "", "/pricing"); // the same page is not a view
    stop();
    await settle();
    expect(sent.map((s) => s.body.path)).toEqual(["/docs", "/pricing"]);
    expect(sent.every((s) => s.url === "/hit")).toBe(true);
  });

  it("sends an event with its detail", async () => {
    const t = await load();
    t.configure({ site: "example.com" });
    t.track("copy-code", { file: "a.tsx" });
    await settle();
    expect(sent[0].body).toMatchObject({ kind: "event", name: "copy-code", data: { file: "a.tsx" } });
  });
});
