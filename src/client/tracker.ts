import type { Beacon } from "../types.js";

// The page's half: a view whenever the page changes, and one last word when
// the tab goes away, carrying how long the visit lasted (which is the only way
// a visit of a single page has a length at all). Everything else is worked out
// on the server.
//
// A visit is an id the tab keeps in sessionStorage: it dies with the tab, is
// never sent anywhere else, and there is no cookie anywhere in this. Do Not
// Track is honoured and the send is a beacon, so it survives the page going
// away and never holds anything up.
//
// Who is left out: anything that is not the site — the dev server on
// localhost, a preview deployment (localStorage["<prefix>:analytics"] = "on"
// counts them anyway, for trying the thing out) — and any browser where that
// key is "off", which is how a site's owner keeps their own visits out of their
// numbers. `?analytics=off` on any page sets it, and tells the server too, which
// is what covers a private window.
//
// Nothing here reads `process` or any framework: it has to run on any page.

export type TrackerOptions = {
  /**
   * The hostname being counted. Visits anywhere else (localhost, previews) are
   * not sent unless the browser has been switched on. Left out, every host
   * counts except localhost and the like.
   */
  site?: string;
  /** Where the collector is mounted. Default `/api/hit`. */
  endpoint?: string;
  /** Namespace for the two keys the browser keeps. Default `analytics`. */
  prefix?: string;
};

let options: Required<Omit<TrackerOptions, "site">> & { site?: string } = {
  endpoint: "/api/hit",
  prefix: "analytics",
};

/** Set where hits go and which site counts. Call before anything is sent. */
export function configure(given: TrackerOptions = {}) {
  options = {
    site: given.site,
    endpoint: given.endpoint ?? "/api/hit",
    prefix: given.prefix ?? "analytics",
  };
}

const VISIT = () => `${options.prefix}:visit`;
const SWITCH = () => `${options.prefix}:analytics`; // "on" counts elsewhere, "off" never counts

const flag = () => {
  try {
    return localStorage.getItem(SWITCH());
  } catch {
    return null;
  }
};

const doNotTrack = () => {
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  // Three spellings, because three browsers got there separately.
  return [nav.doNotTrack, nav.msDoNotTrack, win.doNotTrack].some(
    (said) => said === "1" || said === "yes",
  );
};

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|.*\.local)$/;

/** Who is not counted: Do Not Track, a browser switched off, and anywhere that
    is not the site (unless this browser was switched on). */
const off = () => {
  if (typeof navigator === "undefined") return true;
  if (doNotTrack() || flag() === "off") return true;
  if (flag() === "on") return false;
  return options.site
    ? location.hostname !== options.site
    : LOCAL.test(location.hostname);
};

// The same thing twice within a second is one thing happening: React remounts
// components in development, and a page that is re-opened a second later is
// not a page anyone read.
const last = new Map<string, number>();
function fresh(key: string, within = 1000) {
  const now = Date.now();
  if (now - (last.get(key) ?? 0) < within) return false;
  // A long session on a site with many routes should not grow this for ever:
  // anything older than the window it guards has done its job.
  if (last.size > 200)
    for (const [held, at] of last) if (now - at > within) last.delete(held);
  last.set(key, now);
  return true;
}

function visit(): string {
  try {
    const held = sessionStorage.getItem(VISIT());
    if (held) return held;
    const made = Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem(VISIT(), made);
    return made;
  } catch {
    return "no-storage";
  }
}

function send(hit: Omit<Beacon, "visit" | "width">) {
  if (off()) return;
  const body = JSON.stringify({ ...hit, visit: visit(), width: window.innerWidth });
  const url = options.endpoint;
  // sendBeacon survives the page unloading; fetch is the fallback for the
  // browsers (and the file:// oddities) that do not have it.
  if (navigator.sendBeacon)
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  else void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
}

/** Record something that happened on the page: `track("copy-code", { file })`. */
export function track(
  name: string,
  data?: Record<string, string | number | boolean>,
) {
  send({ kind: "event", path: location.pathname, name, data });
}

// The referrer only counts for the page that was actually opened — moving
// around the site afterwards is the same visit, not a new source.
let arrived = false;

/** Record a view of `path`. The first view of the page carries the referrer. */
export function pageview(path: string = location.pathname) {
  if (!fresh(`view ${path}`)) return; // a remount is not a second view
  const ref = arrived ? null : document.referrer || null;
  arrived = true;
  send({ kind: "view", path, ref });
}

/**
 * `?analytics=off` / `=on` in the address: keep this browser out of the
 * numbers for good (or count it again, and count it off the site too).
 *
 * It is said twice, because one browser can forget: the switch is kept here,
 * and the server is told as well, which remembers the device instead of the
 * session. A private window keeps nothing past its own closing, so without the
 * second half every private window would be a new visitor.
 */
export function applySwitch() {
  const want = new URLSearchParams(location.search).get("analytics");
  if (want !== "on" && want !== "off") return;
  try {
    localStorage.setItem(SWITCH(), want);
  } catch {
    /* no storage — the server's half is what covers this */
  }
  void fetch(options.endpoint, {
    method: "POST",
    body: JSON.stringify({ set: want }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * The last word, sent when the tab is hidden or closed: how long the visit
 * lasted. Time spent looking, not time since the page opened — a tab in the
 * background is not being read, and a forgotten one would report hours. A visit
 * that comes back into view keeps counting, so the length is the whole stay.
 * `path` is asked for at the moment of leaving. Returns a function that stops
 * listening.
 */
export function listen(path: () => string = () => location.pathname) {
  let spent = 0; // ms in the foreground so far
  let since = document.visibilityState === "visible" ? Date.now() : 0;
  let ended = false;

  const done = () => {
    if (document.visibilityState === "visible") {
      since = Date.now(); // back in front: the clock starts again
      ended = false; // and the next leaving is worth a word
      return;
    }
    if (since) spent += Date.now() - since;
    since = 0; // out of sight: nothing accrues
    const at = path();
    if (ended || !fresh(`end ${at}`)) return; // hiding and unloading are one leaving
    ended = true;
    send({ kind: "end", path: at, ms: spent });
  };
  document.addEventListener("visibilitychange", done);
  window.addEventListener("pagehide", done);
  return () => {
    document.removeEventListener("visibilitychange", done);
    window.removeEventListener("pagehide", done);
  };
}

/**
 * Everything, for a page with no framework: the switch, the first view, a view
 * on every history change (so a single-page app counts its routes), and the
 * last word. Returns a function that stops it.
 */
export function start(given: TrackerOptions = {}) {
  configure(given);
  applySwitch();
  pageview();

  let at = location.pathname;
  const moved = () => {
    if (location.pathname === at) return;
    at = location.pathname;
    pageview(at);
  };
  const { pushState, replaceState } = history;
  history.pushState = function (...args) {
    pushState.apply(this, args);
    moved();
  };
  history.replaceState = function (...args) {
    replaceState.apply(this, args);
    moved();
  };
  window.addEventListener("popstate", moved);
  const stop = listen();

  return () => {
    history.pushState = pushState;
    history.replaceState = replaceState;
    window.removeEventListener("popstate", moved);
    stop();
  };
}
