import { LIMITS } from "./config.js";
import type { Beacon, HitKind } from "./types.js";

// Whatever arrived at the endpoint, turned into a beacon or turned away. The
// types in types.ts describe what the page sends; this is what makes that true
// of what a stranger sends, because a type is a promise the compiler keeps and
// the network does not.

const KINDS: HitKind[] = ["view", "end", "event"];

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;

/**
 * The detail carried on an event. Kept deliberately small: ten keys, short
 * names, short values, and nothing that is not a string, a number or a boolean.
 * Anything else is dropped rather than rejected — a beacon that carries one odd
 * field is still a view worth counting.
 */
export function detail(value: unknown): Beacon["data"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string | number | boolean> = {};
  let n = 0;
  for (const [key, held] of Object.entries(value)) {
    if (n >= LIMITS.dataKeys) break;
    if (!key || key.length > LIMITS.dataKey) continue;
    if (typeof held === "string") out[key] = held.slice(0, LIMITS.dataValue);
    else if (typeof held === "number" && Number.isFinite(held)) out[key] = held;
    else if (typeof held === "boolean") out[key] = held;
    else continue;
    n += 1;
  }
  return n ? out : null;
}

const size = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value < 20_000
    ? Math.round(value)
    : undefined;

/** A beacon, or null when there is nothing here worth recording. */
export function read(body: unknown): Beacon | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;

  // The switch is not a hit at all: it carries nothing else and is handled on
  // its own, so it is the first thing checked and the last thing read.
  if (raw.set === "off" || raw.set === "on")
    return { kind: "view", set: raw.set, path: "/", visit: "-" };

  const kind = raw.kind as HitKind;
  if (!KINDS.includes(kind)) return null;

  const path = text(raw.path, LIMITS.path);
  const visit = text(raw.visit, LIMITS.visit);
  if (!path || !visit) return null;

  return {
    kind,
    path,
    visit,
    ref: text(raw.ref, 500),
    width: size(raw.width),
    ms:
      typeof raw.ms === "number" && Number.isFinite(raw.ms) && raw.ms >= 0
        ? Math.min(Math.round(raw.ms), LIMITS.visitMs)
        : undefined,
    name: kind === "event" ? (text(raw.name, LIMITS.name) ?? undefined) : undefined,
    data: kind === "event" ? detail(raw.data) : null,
  };
}
