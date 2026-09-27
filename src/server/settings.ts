import { createHash, randomBytes } from "node:crypto";
import type { Store } from "../stores/store.js";

// The server's half of the settings: the salt the visitor hash is built on,
// where the rows go, who may read them, and how far the request headers may be
// trusted. Each one is an option to createAnalytics(), and failing that an
// environment variable — read when it is needed rather than once, because a
// module is evaluated once per instance and an environment can be set after
// that.

export type Options = {
  /**
   * The hostname being counted, e.g. `example.com`. The collector takes posts
   * from pages on this host (and from the host the collector itself is served
   * on). `ANALYTICS_SITE`.
   */
  site?: string;
  /**
   * Whether anyone at all may read the numbers. Off unless said: a site's
   * numbers being public by default would be a trap rather than a feature.
   * `ANALYTICS_PUBLIC`.
   */
  public?: boolean;
  /** The shared secret that opens a private dashboard. `ANALYTICS_TOKEN`. */
  token?: string;
  /**
   * A Postgres url. A Neon host is spoken to over Neon's HTTP endpoint, any
   * other over the wire protocol (needs `pg` installed); none at all means the
   * file store. `ANALYTICS_DATABASE_URL`, then `DATABASE_URL`.
   */
  databaseUrl?: string;
  /** What the visitor hash is salted with. Set it. `ANALYTICS_SALT`. */
  salt?: string;
  /**
   * How many proxies sit in front of this server — which decides how much of
   * `x-forwarded-for` is real. `true` is one, `false` none. Defaults to one on
   * Vercel, Netlify, Cloudflare Pages and Render, none anywhere else.
   * `ANALYTICS_TRUST_PROXY`.
   */
  trustProxy?: boolean | number;
  /** An extra header to read the country from. `ANALYTICS_COUNTRY_HEADER`. */
  countryHeader?: string;
  /**
   * Where the file store keeps its two files. `ANALYTICS_DIR`, else `.analytics`
   * in the working directory.
   */
  dir?: string;
  /** A store of your own, instead of the one picked from `databaseUrl`. */
  store?: Store;
};

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value === "" ? undefined : value;
};

const flag = (value: string | undefined, fallback: boolean) =>
  value == null ? fallback : value === "true" || value === "1" || value === "yes";

/** Said once per process, however many times the condition is met. */
const said = new Set<string>();
const once = (key: string, say: () => void) => {
  if (said.has(key)) return;
  said.add(key);
  say();
};

const PLATFORM = () =>
  Boolean(env("VERCEL") ?? env("NETLIFY") ?? env("CF_PAGES") ?? env("RENDER"));

export type Settings = ReturnType<typeof settings>;

/** Options first, the environment second, a safe default last. */
export function settings(options: Options = {}) {
  let derived = "";

  const databaseUrl = () =>
    options.databaseUrl ??
    env("ANALYTICS_DATABASE_URL") ??
    env("DATABASE_URL") ??
    "";

  return {
    site: () => options.site ?? env("ANALYTICS_SITE") ?? "",

    isPublic: () => options.public ?? flag(env("ANALYTICS_PUBLIC"), false),

    token: () => options.token ?? env("ANALYTICS_TOKEN") ?? "",

    databaseUrl,

    dir: () => options.dir ?? env("ANALYTICS_DIR") ?? "",

    countryHeader: () =>
      options.countryHeader ?? env("ANALYTICS_COUNTRY_HEADER") ?? "",

    /**
     * How many entries of `x-forwarded-for`, counted from the right, a proxy
     * of ours wrote. Behind a known platform the header is rewritten and can
     * be believed, so the default there is one hop. Anywhere else the default
     * is to believe none of it: without a proxy in front, anyone can set that
     * header to anything and mint whatever visitor hash they like.
     */
    proxyHops(): number {
      const given = options.trustProxy;
      if (typeof given === "number") return Math.max(0, Math.floor(given));
      if (typeof given === "boolean") return given ? 1 : 0;
      const set = env("ANALYTICS_TRUST_PROXY");
      if (set != null) {
        const n = Number(set);
        if (Number.isInteger(n) && n >= 0) return n;
        return flag(set, false) ? 1 : 0;
      }
      if (PLATFORM()) return 1;
      once("proxy", () =>
        console.warn(
          "analytics: no known platform and ANALYTICS_TRUST_PROXY is not set, so x-forwarded-for is ignored and every visit shares one address. Set trustProxy (or ANALYTICS_TRUST_PROXY=1) behind a reverse proxy, or false if there is none.",
        ),
      );
      return 0;
    },

    // The visitor hash is only as anonymous as its salt: with a salt everybody
    // knows, anyone holding an address and a user agent can test whether that
    // person appears in a public dashboard, and the whole claim falls over. So
    // there is no constant default.
    //
    // Set one and that is the end of it. Failing that one is derived from the
    // database url — secret, stable across instances, already required for
    // anything to work — with a warning, because rotating that url quietly
    // rotates every visitor id with it. Failing even that (no database: the
    // file store) the process invents one and says so; on a laptop nothing
    // depends on it holding.
    salt(): string {
      const set = options.salt ?? env("ANALYTICS_SALT");
      if (set) return set;

      const url = databaseUrl();
      if (url) {
        derived ||= createHash("sha256")
          .update(`analytics-salt:${url}`)
          .digest("hex")
          .slice(0, 32);
        once("salt", () =>
          console.warn(
            "analytics: no salt set — deriving one from the database url. Set ANALYTICS_SALT; changing that url changes every visitor id.",
          ),
        );
        return derived;
      }

      derived ||= randomBytes(16).toString("hex");
      once("salt", () =>
        console.warn(
          "analytics: no salt set and no database — this process invented one. Fine on a laptop, never in production.",
        ),
      );
      return derived;
    },
  };
}
