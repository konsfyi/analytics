import { sqlStore, type Row } from "./sql.js";

// Postgres at Neon, over their HTTP endpoint: no pool, no long-lived socket,
// which is what makes it work in a function that exists for 200ms.
//
// It speaks to `https://<host>/sql`, not to port 5432, so it is only chosen for
// a Neon host; any other Postgres url goes to postgres.ts. The SQL itself is
// shared with that store, in sql.ts.

export const NEON = /(^|\.)neon\.(tech|build)$/i;

/** The Neon host in the url, or a refusal that explains itself. */
function host(url: string): string {
  if (!url) throw new Error("analytics: no database url");
  let parsed: URL;
  try {
    parsed = new URL(url.replace(/^postgres(ql)?:\/\//, "https://"));
  } catch {
    throw new Error("analytics: the database url could not be read");
  }
  if (!NEON.test(parsed.hostname))
    throw new Error(
      `analytics: ${parsed.hostname} is not a Neon host. This store speaks Neon's HTTP SQL endpoint, not the Postgres wire protocol — use postgresStore for it.`,
    );
  return parsed.hostname;
}

/** A store on the Neon database at `url` (a normal `postgres://` url). */
export function neonStore(url: string) {
  return sqlStore("database", async (query, params = []) => {
    const res = await fetch(`https://${host(url)}/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Neon-Connection-String": url,
        "Neon-Raw-Text-Output": "true",
        "Neon-Array-Mode": "false",
      },
      body: JSON.stringify({ query, params }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`analytics: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { rows?: Row[] };
    return body.rows ?? [];
  });
}
