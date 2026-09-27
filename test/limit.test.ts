import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE } from "../src/config.js";
import { limiter } from "../src/server/limit.js";

// The rate limit. It is the only thing standing between the one endpoint and
// anybody at all, so the two things worth pinning are that it actually stops a
// flood and that a flood cannot grow the map it keeps for ever — the second
// being the way a rate limiter becomes the denial of service it was meant to
// prevent.

let allow: ReturnType<typeof limiter>["allow"];

describe("allow", () => {
  beforeEach(() => {
    allow = limiter(RATE.keys).allow;
    vi.useRealTimers();
  });

  it("lets a key through until its window is spent", () => {
    for (let i = 0; i < 5; i++) expect(allow("who", 5, 60_000)).toBe(true);
    expect(allow("who", 5, 60_000)).toBe(false);
    expect(allow("who", 5, 60_000)).toBe(false);
  });

  it("counts each key on its own", () => {
    expect(allow("a", 1, 60_000)).toBe(true);
    expect(allow("a", 1, 60_000)).toBe(false);
    expect(allow("b", 1, 60_000)).toBe(true);
  });

  it("starts again once the window has passed", () => {
    vi.useFakeTimers();
    expect(allow("who", 1, 1000)).toBe(true);
    expect(allow("who", 1, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(allow("who", 1, 1000)).toBe(true);
  });

  it("forgets the least recently seen rather than growing without end", () => {
    // A flood from many addresses must cost the map its oldest entries, not
    // the machine's memory.
    for (let i = 0; i < RATE.keys + 500; i++) allow(`addr-${i}`, 1, 60_000);
    // the newest key is still remembered — it was just used
    expect(allow(`addr-${RATE.keys + 499}`, 1, 60_000)).toBe(false);
    // and the very first one has been let go, so it starts fresh
    expect(allow("addr-0", 1, 60_000)).toBe(true);
  });
});
