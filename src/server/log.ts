import { join } from "node:path";
import { MAX_ROWS, MUTE_DAYS } from "../config.js";
import { fileStore } from "../stores/file.js";
import { NEON, neonStore } from "../stores/neon.js";
import { postgresStore } from "../stores/postgres.js";
import type { Store } from "../stores/store.js";
import type { Hit } from "../types.js";
import type { Settings } from "./settings.js";

// The way in and out, and the one place that decides which store is behind it.
// A Neon url goes over Neon's HTTP endpoint, any other Postgres url over the
// wire protocol; with nothing configured, a file — so the whole thing runs and
// can be read without an account anywhere.
//
// Everything above this file talks to these functions and never to a store,
// which is what makes another one (SQLite, anything) a file in stores/ rather
// than a change to the tool.

const HOLD = MUTE_DAYS * 86_400_000;
const FRESH = 60_000; // how long the list of muted devices is trusted

export type Log = ReturnType<typeof log>;

export function log(settings: Settings, given?: Store) {
  // One store per url, made on first use: the url can be set after the
  // instance is made, and a pool should not be opened for a site that never
  // gets a hit.
  let made: { url: string; store: Store } | null = null;

  function store(): Store {
    if (given) return given;
    const url = settings.databaseUrl();
    if (made?.url === url) return made.store;

    let chosen: Store;
    if (!url) {
      chosen = fileStore(settings.dir() || join(process.cwd(), ".analytics"));
    } else {
      let host = "";
      try {
        host = new URL(url.replace(/^postgres(ql)?:\/\//, "https://")).hostname;
      } catch {
        /* unreadable: the postgres store will say so on first use */
      }
      chosen = NEON.test(host) ? neonStore(url) : postgresStore(url);
    }
    made = { url, store: chosen };
    return chosen;
  }

  // How anyone stays out of the numbers on a browser that forgets everything:
  // a private window has no localStorage worth the name, so the switch the page
  // keeps cannot survive one. Instead, ?analytics=off tells the server, which
  // remembers the device rather than the browser session — a salted hash of the
  // address and the user agent, the same for a normal window and a private one
  // of the same browser, and no more reversible into an address than a visitor
  // hash is. It holds for MUTE_DAYS; after that it is simply asked for again.
  // It is the one thing in the whole log that outlives the day.
  let known: { at: number; ids: Set<string> } | null = null;

  return {
    store,

    /** Which store is in use — the dashboard says so, so it is never a guess. */
    backend: () => store().name,

    /** Write one hit. Never throws into the request: a lost hit is not worth a 500. */
    async record(hit: Hit): Promise<void> {
      try {
        await store().record(hit);
      } catch (e) {
        console.error("analytics: could not record", e);
      }
    },

    /**
     * Every hit since `since`, oldest first, capped at MAX_ROWS — `capped` says
     * whether older rows in the window were left out, which the dashboard
     * passes on rather than quietly showing a partial figure as a total.
     */
    read(since: number): Promise<{ hits: Hit[]; capped: boolean }> {
      return store().read(since, MAX_ROWS);
    },

    /** Stop counting this device (or, with `on`, count it again). */
    async mute(id: string, on = false): Promise<void> {
      try {
        known = null; // whatever we knew a moment ago is now out of date
        await store().mute(id, on);
      } catch (e) {
        console.error("analytics: could not set the switch", e);
      }
    },

    /** Whether this device asked not to be counted. Never throws: a store that
        is unreachable counts the hit rather than losing it. */
    async isMuted(id: string): Promise<boolean> {
      try {
        if (!known || Date.now() - known.at > FRESH)
          known = {
            at: Date.now(),
            ids: new Set(await store().muted(Date.now() - HOLD)),
          };
        return known.ids.has(id);
      } catch (e) {
        console.error("analytics: could not read the switch", e);
        return false;
      }
    },
  };
}
