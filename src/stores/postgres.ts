import { sqlStore, type Row } from "./sql.js";

// Any Postgres over the wire protocol — a server of your own, Supabase, RDS,
// Railway, a container on the same box — through node-postgres. The SQL is the
// same as Neon's (sql.ts); only the carrier differs.
//
// One small pool per store, made on first use. `pg` is an optional peer
// dependency and is loaded then too, so a site on Neon or on the file store
// never needs it installed.

const SIZE = 3; // a collector writes one row a request; it never needs many

type Pool = {
  query(q: string, params: unknown[]): Promise<{ rows: Row[] }>;
  on(event: "error", fn: (e: unknown) => void): void;
};

// Held in a variable so a bundler does not try to resolve `pg` for a site that
// never installed it.
const PG = "pg";

/** A store on the Postgres database at `url`. Needs `pg` installed. */
export function postgresStore(url: string) {
  let pool: Promise<Pool> | null = null;
  const connect = (): Promise<Pool> =>
    (pool ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PG)
      .then((mod: { default?: unknown; Pool?: unknown }) => {
        const pg = (mod.default ?? mod) as {
          Pool: new (config: { connectionString: string; max: number }) => Pool;
        };
        const p = new pg.Pool({ connectionString: url, max: SIZE });
        // An idle client dropping (a restart, a network blip) must not take
        // the process with it; the next query opens a new one.
        p.on("error", (e) => console.error("analytics: postgres", e));
        return p;
      })
      .catch((e: unknown) => {
        pool = null;
        throw new Error(
          `analytics: could not open a Postgres pool — is \`pg\` installed? (${String(e)})`,
        );
      }));

  return sqlStore("database", async (query, params = []) => {
    const p = await connect();
    return (await p.query(query, params)).rows;
  });
}
