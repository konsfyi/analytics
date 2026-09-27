import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hit } from "../types.js";
import type { Store } from "./store.js";

// A line of JSON per hit, in a file. This is what runs when nothing is
// configured: no account, no database, no signup — install the thing and it
// works, which is most of why it is worth having. It is also what the tests
// use, and what a small site on one long-running server can stay on for a
// long time. (On a serverless platform the disk does not last; use a
// database there.)

/** A store in two files under `dir`: `analytics.jsonl` and `analytics-muted.json`. */
export function fileStore(dir: string): Store {
  const FILE = join(dir, "analytics.jsonl");
  const MUTED = join(dir, "analytics-muted.json");

  async function held(): Promise<Record<string, number>> {
    try {
      return JSON.parse(await readFile(MUTED, "utf8")) as Record<string, number>;
    } catch {
      return {};
    }
  }

  return {
    name: "local file",

    async record(hit: Hit) {
      await mkdir(dir, { recursive: true });
      await appendFile(FILE, `${JSON.stringify(hit)}\n`, "utf8");
    },

    async read(since: number, cap: number) {
      let text = "";
      try {
        text = await readFile(FILE, "utf8");
      } catch {
        return { hits: [], capped: false }; // nothing recorded here yet
      }
      const hits: Hit[] = [];
      for (const line of text.split("\n")) {
        if (!line) continue;
        // A line can be half-written: appends from two requests at once, or a
        // process that stopped mid-write. One bad line is not worth the
        // dashboard, so it is skipped.
        try {
          const hit = JSON.parse(line) as Hit;
          if (hit.ts >= since) hits.push(hit);
        } catch {
          continue;
        }
      }
      return cap && hits.length > cap
        ? { hits: hits.slice(-cap), capped: true }
        : { hits, capped: false };
    },

    async mute(id: string, on: boolean) {
      const all = await held();
      if (on) delete all[id];
      else all[id] = Date.now();
      await mkdir(dir, { recursive: true });
      await writeFile(MUTED, JSON.stringify(all), "utf8");
    },

    async muted(since: number) {
      return Object.entries(await held())
        .filter(([, at]) => at >= since)
        .map(([id]) => id);
    },
  };
}
