import { createHash } from "node:crypto";
import { read } from "../beacon.js";
import { LIMITS, RATE } from "../config.js";
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
} from "../parse.js";
import type { Hit } from "../types.js";
import type { Limiter } from "./limit.js";
import type { Log } from "./log.js";
import type { Settings } from "./settings.js";

// The collector. The page posts what it knows — the page, its visit, the
// screen — and everything else is read off the request here: the channel from
// the referrer, the country from the platform's header, the system and browser
// from the user agent. Nothing that identifies anyone is kept: the visitor is a
// hash of address + user agent + the day, so it cannot be followed to tomorrow
// and cannot be turned back into an address. Bots are dropped.
//
// A Request in, a Response out, and nothing of any framework in between — a
// Next route, a Hono handler or a Worker is one line away.
//
// It is the one endpoint, and it has to take unauthenticated writes: a browser
// cannot hold a secret. So everything arriving is treated as a stranger's. The
// body is capped before it is read, the origin must be this site, one address
// may only do so much (limit.ts), and every field is validated rather than
// trusted (beacon.ts). It never answers with anything but 204: what the
// collector did with a hit is not a caller's business, and an endpoint that
// says "rejected" is an endpoint that can be probed.

const no = () => new Response(null, { status: 204 });

const day = () => new Date().toISOString().slice(0, 10);
const hash = (of: string) =>
  createHash("sha256").update(of).digest("hex").slice(0, 16);

/**
 * Whether this request came from the site it claims to. A browser sets Origin
 * on every POST and cannot lie about it, so this turns away anything posted
 * from another page. A request with no Origin at all is something other than a
 * browser — curl, a replayed beacon — and is allowed through to the rate limit
 * rather than blocked, because that is also how the thing is tested.
 */
function fromHere(req: Request, site: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === new URL(req.url).hostname || (!!site && host === site);
  } catch {
    return false;
  }
}

/** The collector for one instance: one beacon in, taken or turned away, and
    always a 204 out. */
export function collector(
  settings: Settings,
  log: Log,
  limit: Limiter,
): (req: Request) => Promise<Response> {
  /** Who, for a day: different tomorrow, and never an address again. */
  const visitorOf = (from: string, ua: string) =>
    hash(`${settings.salt()}:${day()}:${from}:${ua}`);

  /** Which device, for the switch below: the same one tomorrow — a private
      window and a normal one of the same browser are the same device, which
      is the whole point of it (see log.ts). */
  const deviceOf = (from: string, ua: string) =>
    hash(`${settings.salt()}:device:${from}:${ua}`);

  return async function collect(req: Request): Promise<Response> {
    const ua = req.headers.get("user-agent") ?? "";
    if (isBot(ua)) return no();
    if (!fromHere(req, settings.site())) return no();

    // Cap the body before reading it: Vercel stops a request at 4.5MB and a
    // server on its own stops it nowhere, but a beacon is 400 bytes.
    if (Number(req.headers.get("content-length") ?? 0) > LIMITS.body)
      return no();
    const raw = await req.text();
    if (raw.length > LIMITS.body) return no();

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return no();
    }
    const beacon = read(body);
    if (!beacon) return no();

    const header = (name: string) => req.headers.get(name);
    const from = address(header, settings.proxyHops());
    const who = `${from}:${ua}`;

    // ?analytics=off / =on, which the page passes on: the browser remembers it
    // for itself, and so does the server, so that a private window — which keeps
    // nothing — is left out too.
    if (beacon.set) {
      if (!limit.allow(`set:${who}`, RATE.switches, RATE.switchWindow))
        return no();
      await log.mute(deviceOf(from, ua), beacon.set === "on");
      return no();
    }

    if (!limit.allow(`hit:${who}`, RATE.hits, RATE.hitWindow)) return no();
    if (await log.isMuted(deviceOf(from, ua))) return no();

    // The site's own host is where "moving around the site" comes from — the
    // collector's, when the site has not been named.
    const host = settings.site() || new URL(req.url).hostname;
    // the page tells us where it came from; the request's own header is the
    // fallback for anything that posts here without saying (a beacon replay, curl)
    const ref = beacon.ref ?? req.headers.get("referer");
    const hit: Hit = {
      ts: Date.now(),
      kind: beacon.kind,
      path: beacon.path,
      visit: beacon.visit,
      visitor: visitorOf(from, ua),
      channel: channel(ref, host),
      source: source(ref, host),
      country: country(header, settings.countryHeader()),
      device: device(ua, beacon.width),
      screen: screen(beacon.width),
      os: os(ua),
      browser: browser(ua),
      ms: beacon.ms,
      name: beacon.name,
      data: beacon.data ?? null,
    };
    await log.record(hit);
    return no();
  };
}
