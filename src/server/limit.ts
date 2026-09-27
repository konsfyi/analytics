import { RATE } from "../config.js";

// What stops the one endpoint being an open tap. Nothing here is exact and it
// does not try to be: the collector takes unauthenticated writes by necessity —
// a browser cannot hold a secret — so the job is to make a flood cost something
// rather than to meter anybody.
//
// A fixed window per key, held in memory. On a platform that runs several
// instances each one counts separately, so the real ceiling is this times the
// number of instances; on a single server it is exactly this. Both are far
// below what a thousand requests a second needs.

type Window = { n: number; until: number };

export type Limiter = {
  /** Whether this key may do one more of whatever it is doing. */
  allow(key: string, max: number, ms: number): boolean;
  /** Forget everything. */
  reset(): void;
};

/**
 * A limiter that remembers at most `keys` keys. Least-recently-seen ones are
 * dropped past that, so a flood from many addresses cannot grow the map without
 * end — it only makes the map forget faster, which at worst lets a slow flood
 * through.
 */
export function limiter(keys: number = RATE.keys): Limiter {
  const windows = new Map<string, Window>();

  const evict = () => {
    if (windows.size <= keys) return;
    for (const key of windows.keys()) {
      windows.delete(key);
      if (windows.size <= keys) return;
    }
  };

  return {
    allow(key, max, ms) {
      const now = Date.now();
      const held = windows.get(key);

      // Re-inserting moves the key to the end: the map is then in order of
      // last use, and the oldest to evict are simply the first out of keys().
      windows.delete(key);

      if (!held || held.until <= now) {
        windows.set(key, { n: 1, until: now + ms });
        evict();
        return true;
      }

      held.n += 1;
      windows.set(key, held);
      evict();
      return held.n <= max;
    },

    reset() {
      windows.clear();
    },
  };
}
