import { MUTE_DAYS } from "../config.js";
import type { Hit } from "../types.js";
import type { Store } from "./store.js";

// Every Postgres store, whatever carries the query. The schema and the four
// statements live here once; a store is this plus a way to run one statement —
// Neon's HTTP endpoint (neon.ts), a node-postgres pool (postgres.ts), or an
// in-process Postgres in the tests (PGlite). So the SQL that runs in production is the
// SQL the tests run, and a new Postgres host is a few lines, not a copy.

export type Row = Record<string, unknown>;
/** Run one statement with $1… parameters and hand back its rows. */
export type Exec = (query: string, params?: unknown[]) => Promise<Row[]>;

// One statement per call — Neon's HTTP endpoint prepares each query, and a
// prepared statement holds exactly one command.
const CREATE = [
  `create table if not exists hit (
     id bigserial primary key,
     ts timestamptz not null default now(),
     kind text not null,
     path text not null,
     visit text not null,
     visitor text not null,
     channel text not null,
     source text,
     country text,
     device text,
     screen text,
     os text,
     browser text,
     ms integer,
     name text,
     data jsonb
   )`,
  `create index if not exists hit_ts on hit (ts)`,
  // Devices that asked not to be counted.
  `create table if not exists muted (
     id text primary key,
     ts timestamptz not null default now()
   )`,
];

// Drivers disagree about types: Neon's raw text mode hands back strings for
// everything, node-postgres a string for a numeric and an object for jsonb.
// Whatever came back, a Hit leaves here.
const asHit = (r: Row): Hit => ({
  ...(r as unknown as Hit),
  ts: Number(r.ts),
  ms: r.ms == null ? undefined : Number(r.ms),
  data:
    typeof r.data === "string"
      ? (JSON.parse(r.data) as Hit["data"])
      : (r.data as Hit["data"]),
});

/** A Store over `exec`. `name` is what the dashboard calls it. */
export function sqlStore(name: string, sql: Exec): Store {
  // The schema is made once per instance. A failure must not be remembered:
  // the first call can fail because the database was asleep or the network
  // blinked, and holding on to that rejected promise used to mean every write
  // for the life of the instance failed with it — silently, because record()
  // swallows.
  let ready: Promise<void> | null = null;
  const ensure = (): Promise<void> =>
    (ready ??= (async () => {
      for (const statement of CREATE) await sql(statement);
    })().catch((e: unknown) => {
      ready = null;
      throw e;
    }));

  return {
    name,

    async record(hit: Hit) {
      await ensure();
      await sql(
        `insert into hit (ts, kind, path, visit, visitor, channel, source, country, device, screen, os, browser, ms, name, data)
         values (to_timestamp($1 / 1000.0), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          hit.ts,
          hit.kind,
          hit.path,
          hit.visit,
          hit.visitor,
          hit.channel,
          hit.source,
          hit.country,
          hit.device,
          hit.screen,
          hit.os,
          hit.browser,
          hit.ms ?? null,
          hit.name ?? null,
          hit.data ? JSON.stringify(hit.data) : null,
        ],
      );
    },

    async read(since: number, cap: number) {
      await ensure();
      // One more than the cap, so a full page is told apart from an exact fit.
      const rows = await sql(
        `select extract(epoch from ts) * 1000 as ts, kind, path, visit, visitor, channel, source,
                country, device, screen, os, browser, ms, name, data
         from hit where ts >= to_timestamp($1 / 1000.0) order by ts desc limit $2`,
        [since, cap + 1],
      );
      const capped = rows.length > cap;
      return {
        // desc for the limit to take the most recent; the rest of the tool
        // reads oldest first.
        hits: (capped ? rows.slice(0, cap) : rows).map(asHit).reverse(),
        capped,
      };
    },

    async mute(id: string, on: boolean) {
      await ensure();
      if (on) {
        await sql(`delete from muted where id = $1`, [id]);
        return;
      }
      // Anyone can ask to be left out, and a device is a hash of an address
      // and a user agent — vary the user agent and you mint a new one. The
      // rate limit is what makes that expensive; dropping the expired rows on
      // the way in is what keeps the table from being a place to put things
      // regardless.
      await sql(
        `delete from muted where ts < now() - ($1 || ' days')::interval`,
        [String(MUTE_DAYS)],
      );
      await sql(
        `insert into muted (id) values ($1) on conflict (id) do update set ts = now()`,
        [id],
      );
    },

    async muted(since: number) {
      await ensure();
      const rows = await sql(
        `select id from muted where ts >= to_timestamp($1 / 1000.0)`,
        [since],
      );
      return rows.map((r) => String(r.id));
    },
  };
}
