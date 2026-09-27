import { describe, expect, it } from "vitest";
import { detail, read } from "../src/beacon.js";
import { LIMITS } from "../src/config.js";

// What the endpoint will take. The types describe what the page sends; this is
// what makes that true of what a stranger sends, so the interesting cases are
// all the ones nobody's browser would ever produce.

describe("read", () => {
  it("takes an ordinary view", () => {
    expect(
      read({ kind: "view", path: "/canvas-card", visit: "abc123", width: 1512 }),
    ).toMatchObject({ kind: "view", path: "/canvas-card", visit: "abc123", width: 1512 });
  });

  it("refuses anything that is not a hit", () => {
    expect(read(null)).toBe(null);
    expect(read("a string")).toBe(null);
    expect(read([1, 2, 3])).toBe(null);
    expect(read({})).toBe(null);
    expect(read({ kind: "delete", path: "/", visit: "a" })).toBe(null);
    expect(read({ kind: "view", visit: "a" })).toBe(null); // no page
    expect(read({ kind: "view", path: "/" })).toBe(null); // no visit
  });

  it("cuts a long field down rather than refusing it", () => {
    const beacon = read({
      kind: "event",
      path: "/".padEnd(5000, "x"),
      visit: "v".repeat(500),
      name: "n".repeat(500),
    });
    expect(beacon?.path.length).toBe(LIMITS.path);
    expect(beacon?.visit.length).toBe(LIMITS.visit);
    expect(beacon?.name?.length).toBe(LIMITS.name);
  });

  it("does not believe a visit that claims to have lasted a week", () => {
    expect(read({ kind: "end", path: "/", visit: "a", ms: 9e12 })?.ms).toBe(
      LIMITS.visitMs,
    );
    expect(read({ kind: "end", path: "/", visit: "a", ms: -5 })?.ms).toBe(
      undefined,
    );
    expect(read({ kind: "end", path: "/", visit: "a", ms: "20" })?.ms).toBe(
      undefined,
    );
  });

  it("ignores a width no screen has", () => {
    expect(read({ kind: "view", path: "/", visit: "a", width: 0 })?.width).toBe(
      undefined,
    );
    expect(
      read({ kind: "view", path: "/", visit: "a", width: 999999 })?.width,
    ).toBe(undefined);
    expect(
      read({ kind: "view", path: "/", visit: "a", width: -1 })?.width,
    ).toBe(undefined);
  });

  it("carries detail on an event and nowhere else", () => {
    expect(
      read({ kind: "event", path: "/", visit: "a", name: "copy", data: { file: "x.tsx" } })
        ?.data,
    ).toEqual({ file: "x.tsx" });
    // a view has no name and no detail however hard it insists
    const view = read({
      kind: "view",
      path: "/",
      visit: "a",
      name: "copy",
      data: { file: "x.tsx" },
    });
    expect(view?.name).toBe(undefined);
    expect(view?.data).toBe(null);
  });

  it("reads the switch as the switch and nothing else", () => {
    expect(read({ set: "off" })?.set).toBe("off");
    expect(read({ set: "on" })?.set).toBe("on");
    expect(read({ set: "maybe" })).toBe(null);
  });
});

describe("detail", () => {
  it("keeps only what a row can hold", () => {
    expect(detail({ a: "x", b: 2, c: true })).toEqual({ a: "x", b: 2, c: true });
    // nothing else is a value: an object, a function, NaN, undefined
    expect(
      detail({ a: { deep: 1 }, b: undefined, c: NaN, d: [1], e: "kept" }),
    ).toEqual({ e: "kept" });
    expect(detail(null)).toBe(null);
    expect(detail("string")).toBe(null);
    expect(detail({})).toBe(null);
  });

  it("stops at ten keys and cuts long ones down", () => {
    const many = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`k${i}`, i]),
    );
    expect(Object.keys(detail(many) ?? {}).length).toBe(LIMITS.dataKeys);

    const long = detail({
      ["k".repeat(200)]: "dropped, the key is too long",
      short: "v".repeat(5000),
    });
    expect(Object.keys(long ?? {})).toEqual(["short"]);
    expect(long?.short).toHaveLength(LIMITS.dataValue);
  });
});
