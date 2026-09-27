import { describe, expect, it } from "vitest";
import {
  address,
  browser,
  channel,
  country,
  device,
  isBot,
  os,
  screen,
  source,
} from "../src/parse.js";

// The regexes. These are the lines most likely to be changed by somebody
// else — a browser nobody thought of, a referrer that belongs somewhere else —
// and the ones where a change quietly costs a month of numbers, because nothing
// breaks: traffic simply starts reading as "Other". So they are pinned here
// against real user agent strings rather than invented ones.

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  // The ones that arrive from a post. Apple's web view sends neither `Safari/`
  // nor `Version/`, so without the in-app list these read as "Other" — which is
  // where a good share of this site's traffic comes from.
  xIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.51",
  instagram:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 275.0.0.27.98",
  googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  headless:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36",
};

const HOST = "example.com";

describe("browser", () => {
  it("names the app a page was opened inside before the engine it borrows", () => {
    expect(browser(UA.xIphone)).toBe("X (in-app)");
    expect(browser(UA.instagram)).toBe("Instagram (in-app)");
  });

  it("puts Chrome before Safari, because every Chrome says Safari too", () => {
    expect(browser(UA.chromeMac)).toBe("Chrome");
    expect(browser(UA.safariIphone)).toBe("Safari");
    expect(browser(UA.edge)).toBe("Edge");
    expect(browser(UA.firefoxWindows)).toBe("Firefox");
  });

  it("says Other rather than guessing", () => {
    expect(browser("")).toBe("Other");
  });
});

describe("os", () => {
  it("reads the system off the user agent", () => {
    expect(os(UA.chromeMac)).toBe("macOS");
    expect(os(UA.safariIphone)).toBe("iOS");
    expect(os(UA.chromeAndroid)).toBe("Android");
    expect(os(UA.firefoxWindows)).toBe("Windows");
    expect(os("")).toBe("Other");
  });

  it("does not read a Mac as an iPhone", () => {
    expect(os(UA.chromeMac)).not.toBe("iOS");
  });
});

describe("device", () => {
  it("takes the user agent first and the width as the tiebreak", () => {
    expect(device(UA.safariIphone)).toBe("Phone");
    expect(device(UA.safariIpad)).toBe("Tablet");
    expect(device(UA.chromeAndroid)).toBe("Phone");
    expect(device(UA.chromeMac)).toBe("Desktop");
    expect(device("", 400)).toBe("Phone");
    expect(device("", 900)).toBe("Tablet");
    expect(device("", 1600)).toBe("Desktop");
  });
});

describe("screen", () => {
  it("buckets a width, and says so when there is none", () => {
    expect(screen()).toBe("Unknown");
    expect(screen(390)).toBe("< 480");
    expect(screen(768)).toBe("768 – 1024");
    expect(screen(1512)).toBe("1440 – 1920");
    expect(screen(3840)).toBe("1920+");
  });
});

describe("isBot", () => {
  it("drops the ones that say so", () => {
    expect(isBot(UA.googlebot)).toBe(true);
    expect(isBot(UA.headless)).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot(UA.chromeMac)).toBe(false);
    expect(isBot(UA.xIphone)).toBe(false);
  });
});

describe("channel", () => {
  it("does not call moving around the site a visit from somewhere", () => {
    expect(channel(`https://${HOST}/canvas-card`, HOST)).toBe("direct");
    expect(channel(null, HOST)).toBe("direct");
    expect(channel("not a url", HOST)).toBe("direct");
  });

  it("sorts a referrer into search, social or referral", () => {
    expect(channel("https://www.google.com/", HOST)).toBe("search");
    expect(channel("https://duckduckgo.com/", HOST)).toBe("search");
    expect(channel("https://t.co/abc123", HOST)).toBe("social");
    expect(channel("https://news.ycombinator.com/item?id=1", HOST)).toBe(
      "social",
    );
    expect(channel("https://some-blog.example/post", HOST)).toBe("referral");
  });
});

describe("source", () => {
  it("is the host without www, and nothing for the site itself", () => {
    expect(source("https://www.google.com/search?q=x", HOST)).toBe("google.com");
    expect(source(`https://${HOST}/x`, HOST)).toBe(null);
    expect(source(null, HOST)).toBe(null);
  });
});

describe("address", () => {
  const of = (headers: Record<string, string>) => (name: string) =>
    headers[name] ?? null;

  it("reads nothing at all when no proxy is in front", () => {
    // The point of the setting: without a proxy that header is a client's
    // word, and believing it means anyone can mint whatever visitor they like.
    expect(address(of({ "x-forwarded-for": "9.9.9.9" }), 0)).toBe("");
  });

  it("takes the entry the trusted proxy wrote, not the one the client sent", () => {
    const forged = of({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(address(forged, 1)).toBe("5.6.7.8");
    expect(address(forged, 2)).toBe("1.2.3.4");
  });

  it("is the single entry a platform like Vercel rewrites it to", () => {
    expect(address(of({ "x-forwarded-for": "203.0.113.7" }), 1)).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to the proxy's own header when there is no chain", () => {
    expect(address(of({ "x-real-ip": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(address(of({}), 1)).toBe("");
  });
});

describe("country", () => {
  const of = (headers: Record<string, string>) => (name: string) =>
    headers[name] ?? null;

  it("reads whichever header this platform sets", () => {
    expect(country(of({ "x-vercel-ip-country": "de" }))).toBe("DE");
    expect(country(of({ "cf-ipcountry": "FR" }))).toBe("FR");
    expect(country(of({ "fastly-client-country-code": "JP" }))).toBe("JP");
  });

  it("reads Netlify's, which is a whole object", () => {
    const geo = Buffer.from(
      JSON.stringify({ country: { code: "ES", name: "Spain" } }),
    ).toString("base64");
    expect(country(of({ "x-nf-geo": geo }))).toBe("ES");
    expect(country(of({ "x-nf-geo": "not base64 json" }))).toBe(null);
  });

  it("prefers a header the site named itself", () => {
    expect(
      country(of({ "x-vercel-ip-country": "DE", "x-my-country": "IT" }), "x-my-country"),
    ).toBe("IT");
  });

  it("does not record a CDN's way of saying it does not know", () => {
    expect(country(of({ "cf-ipcountry": "XX" }))).toBe(null);
    expect(country(of({ "cf-ipcountry": "T1" }))).toBe(null);
    expect(country(of({}))).toBe(null);
  });
});
