// What a hit can be read off a request: where it came from, and what it was
// opened on. Everything here is derived server-side from the user agent and
// the referrer — the browser sends only the page, the screen and its session.

/** How the visit started: the Umami-style channels. */
export type Channel = "direct" | "search" | "social" | "referral";

const SEARCH =
  /google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave|startpage|qwant|search\./i;
const SOCIAL =
  /x\.com|twitter|t\.co|instagram|facebook|fb\.com|linkedin|lnkd\.in|reddit|pinterest|threads|tiktok|youtube|youtu\.be|telegram|whatsapp|mastodon|bsky|substack|dribbble|behance|medium|news\.ycombinator/i;

/** The channel a referrer belongs to; same-site referrers are not a channel. */
export function channel(referrer: string | null, host: string): Channel {
  if (!referrer) return "direct";
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "direct";
  }
  if (url.hostname === host) return "direct"; // moving around the site itself
  if (SEARCH.test(url.hostname)) return "search";
  if (SOCIAL.test(url.hostname)) return "social";
  return "referral";
}

/** The referrer as it is worth showing: the host, or nothing for direct visits. */
export function source(referrer: string | null, host: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return url.hostname === host ? null : url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// The browsers people arrive inside rather than open themselves. Their web
// views drop the tokens the list below looks for — Apple's send neither
// `Safari/` nor `Version/` — so without this a tap from an X post reads as
// "Other", which is where a good share of this site's traffic comes from.
const IN_APP: [RegExp, string][] = [
  [/twitter|twitterandroid/i, "X (in-app)"],
  [/instagram/i, "Instagram (in-app)"],
  [/fban|fbav|fb_iab|fbios|fbsv/i, "Facebook (in-app)"],
  [/linkedinapp/i, "LinkedIn (in-app)"],
  [/telegram/i, "Telegram (in-app)"],
  [/\bgsa\//i, "Google app"],
  [/;\s?wv\)/i, "Android web view"],
];

const BROWSERS: [RegExp, string][] = [
  [/edg[ea]?\//i, "Edge"],
  [/opr\/|opera/i, "Opera"],
  [/arc\//i, "Arc"],
  [/chrome|crios/i, "Chrome"],
  [/firefox|fxios/i, "Firefox"],
  [/safari/i, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/iphone|ipad|ipod|ios/i, "iOS"],
  [/mac os x|macintosh/i, "macOS"],
  [/android/i, "Android"],
  [/windows/i, "Windows"],
  [/cros/i, "ChromeOS"],
  [/linux/i, "Linux"],
];

/** Browser name — the app it is embedded in first, then the browser itself
    (Chrome before Safari: every Chrome user agent also says Safari). */
export function browser(ua: string): string {
  for (const [re, name] of IN_APP) if (re.test(ua)) return name;
  for (const [re, name] of BROWSERS) if (re.test(ua)) return name;
  return "Other";
}

/** Operating system name. */
export function os(ua: string): string {
  for (const [re, name] of SYSTEMS) if (re.test(ua)) return name;
  return "Other";
}

/** Phone, tablet or desktop — the user agent first, the screen as the tiebreak. */
export function device(ua: string, width?: number): string {
  if (/ipad|tablet/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)))
    return "Tablet";
  if (/mobile|iphone|ipod|android/i.test(ua)) return "Phone";
  if (width && width < 768) return "Phone";
  if (width && width < 1024) return "Tablet";
  return "Desktop";
}

/** A bot should not be counted; the common ones say so in the user agent. */
export const isBot = (ua: string) =>
  /bot|crawler|spider|crawling|preview|headless|lighthouse|pagespeed|monitor|curl|wget|python-requests|axios|node-fetch/i.test(
    ua,
  );

/** The screen bucket a width belongs to — the dimensions row of the dashboard. */
export function screen(width?: number): string {
  if (!width) return "Unknown";
  if (width < 480) return "< 480";
  if (width < 768) return "480 – 768";
  if (width < 1024) return "768 – 1024";
  if (width < 1440) return "1024 – 1440";
  if (width < 1920) return "1440 – 1920";
  return "1920+";
}

/* ---------- reading the request itself ---------- */

/** A header, however the caller happens to hold them. */
export type HeaderReader = (name: string) => string | null | undefined;

/**
 * The address a request came from, as far as it can be believed.
 *
 * `x-forwarded-for` is a list that every proxy appends to, so the only entry
 * that cannot have been written by the client is the one `hops` places from the
 * right — one proxy back, the address that proxy saw. With no proxy in front
 * (`hops` of 0) the header is worth nothing and is not read at all: the caller
 * gets an empty string and everybody shares one bucket, which is a visible
 * failure rather than a quiet one.
 */
export function address(header: HeaderReader, hops: number): string {
  if (hops <= 0) return "";
  const chain = (header("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  // A chain shorter than the hops claimed is a misconfiguration (or a CDN that
  // rewrites rather than appends): fall back to the last entry, which is always
  // the least forgeable one available, and then to the proxy's own header.
  const mine = chain[chain.length - hops] ?? chain[chain.length - 1];
  return mine ?? (header("x-real-ip") ?? "").trim();
}

// Where each platform puts the country it worked out from the address. Netlify
// is the odd one: a JSON object rather than a code.
const COUNTRY = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "x-country-code",
  "x-geo-country",
  "fastly-client-country-code",
];

const CODE = /^[A-Za-z]{2}$/;
/** Placeholders the CDNs use when they could not tell. */
const NOWHERE = new Set(["XX", "T1", "ZZ", "A1", "A2"]);

/** The visitor's country, from whichever header this platform sets. */
export function country(header: HeaderReader, extra = ""): string | null {
  const names = extra ? [extra, ...COUNTRY] : COUNTRY;
  for (const name of names) {
    const value = (header(name) ?? "").trim();
    if (CODE.test(value)) {
      const code = value.toUpperCase();
      if (!NOWHERE.has(code)) return code;
    }
  }
  // Netlify: base64 JSON, `{ country: { code } }`.
  const geo = header("x-nf-geo");
  if (geo) {
    try {
      const json = JSON.parse(
        atob(geo),
      ) as { country?: { code?: string } };
      const code = json.country?.code?.toUpperCase();
      if (code && CODE.test(code) && !NOWHERE.has(code)) return code;
    } catch {
      /* not the shape we hoped for — no country, then */
    }
  }
  return null;
}
