import { PGlite } from "@electric-sql/pglite";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { fileStore } from "../src/stores/file.js";
import { sqlStore } from "../src/stores/sql.js";
import type { Store } from "../src/stores/store.js";
import type { Hit } from "../src/types.js";

// What every store has to do, run against each of them. The Postgres one is
// the real SQL (sql.ts — the same statements Neon and node-postgres run) on a
// real Postgres: PGlite, Postgres compiled to run inside this process, so the
// test needs no server and cannot reach one.

const T = Date.UTC(2026, 8, 20, 12, 0, 0);

const hit = (over: Partial<Hit> = {}): Hit => ({
  ts: T,
  kind: "view",
  path: "/",
  visit: "v1",
  visitor: "who",
  channel: "direct",
  source: null,
  country: "DE",
  device: "Desktop",
  screen: "1440 – 1920",
  os: "macOS",
  browser: "Chrome",
  ...over,
});

// The file store writes undefined fields as absent, a SQL store as null.
const same = (h: Hit) => ({
  ...h,
  name: h.name ?? null,
  data: h.data ?? null,
  ms: h.ms ?? undefined,
});

function contract(label: string, make: () => Promise<Store>) {
  describe(label, () => {
    let store: Store;
    beforeAll(async () => {
      store = await make();
      await store.record(hit({ ts: T - 3000, path: "/old" }));
      await store.record(hit({ ts: T - 2000, kind: "end", ms: 42_000 }));
      await store.record(
        hit({
          ts: T - 1000,
          kind: "event",
          name: "copy-code",
          data: { file: "card.tsx", lines: 12, ok: true },
        }),
      );
      await store.record(hit({ ts: T, path: "/docs", source: "t.co", channel: "social" }));
    });

    it("hands back a window, oldest first, every field intact", async () => {
      const { hits, capped } = await store.read(T - 2000, 100);
      expect(capped).toBe(false);
      expect(hits.map((h) => h.ts)).toEqual([T - 2000, T - 1000, T]);
      expect(same(hits[0])).toMatchObject({ kind: "end", ms: 42_000 });
      expect(same(hits[1])).toMatchObject({
        kind: "event",
        name: "copy-code",
        data: { file: "card.tsx", lines: 12, ok: true },
      });
      expect(same(hits[2])).toMatchObject({ path: "/docs", source: "t.co", channel: "social" });
    });

    it("keeps the most recent rows when the cap bites, and says so", async () => {
      const { hits, capped } = await store.read(0, 2);
      expect(capped).toBe(true);
      expect(hits.map((h) => h.ts)).toEqual([T - 1000, T]);
    });

    it("an exact fit is not capped", async () => {
      const { capped } = await store.read(0, 4);
      expect(capped).toBe(false);
    });

    it("remembers a muted device, and forgets it when asked", async () => {
      await store.mute("device-a", false);
      await store.mute("device-b", false);
      expect((await store.muted(Date.now() - 60_000)).sort()).toEqual([
        "device-a",
        "device-b",
      ]);
      await store.mute("device-a", true);
      expect(await store.muted(Date.now() - 60_000)).toEqual(["device-b"]);
      // muting twice is one row, not two
      await store.mute("device-b", false);
      expect(await store.muted(Date.now() - 60_000)).toEqual(["device-b"]);
    });
  });
}

contract("the file store", async () => {
  const dir = join(process.env.ANALYTICS_DIR as string, "contract");
  rmSync(dir, { recursive: true, force: true });
  return fileStore(dir);
});

contract("the Postgres store (sql.ts on PGlite)", async () => {
  const db = new PGlite();
  return sqlStore("database", async (q, params = []) => (await db.query(q, params)).rows as Record<string, unknown>[]);
});
