import type { Hit } from "../types.js";

// What a place to keep hits has to be able to do. Four things, none of them
// clever: take a row, hand back a window of rows, remember a device that asked
// not to be counted, and say which ones those are.
//
// Aggregation is deliberately not in here. It is done in memory over the rows
// of the window being looked at (summary.ts), so every store gets the same
// numbers from the same code and a new store is an afternoon's work rather than
// a re-implementation of the whole tool in SQL.

export type Store = {
  /** What to call it on the dashboard, so the store in use is never a guess. */
  readonly name: string;
  record(hit: Hit): Promise<void>;
  /** Hits since `since`, oldest first, at most `cap` of them (the most recent). */
  read(since: number, cap: number): Promise<{ hits: Hit[]; capped: boolean }>;
  mute(id: string, on: boolean): Promise<void>;
  muted(since: number): Promise<string[]>;
};
