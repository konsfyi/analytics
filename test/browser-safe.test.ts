import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The dashboard and the tracker have to run on any page, and a plain page has
// no `process` in the browser — reading one leaves a blank page (it did, once).
// This follows every file each of them imports, all the way down, and fails if
// any of them mentions `process` or reaches for a Node built-in. Next hides the
// problem by filling in process.env at build time, so nothing else here would
// catch it.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const ENTRIES = ["dashboard/index.ts", "client/index.ts", "next/index.ts", "index.ts"];

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // a package: react, next, and nothing else
  const base = resolve(dirname(from), spec).replace(/\.js$/, "");
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    try {
      readFileSync(base + ext);
      return base + ext;
    } catch {}
  }
  return null;
}

function graph(entry: string, seen = new Set<string>(), packages = new Set<string>()) {
  if (seen.has(entry)) return { seen, packages };
  seen.add(entry);
  const text = readFileSync(entry, "utf8");
  for (const m of text.matchAll(
    /^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"|^import\s+"([^"]+)"/gm,
  )) {
    const spec = m[1] ?? m[2];
    const file = resolveImport(entry, spec);
    if (file) graph(file, seen, packages);
    else if (!spec.startsWith(".")) packages.add(spec);
  }
  return { seen, packages };
}

const strip = (text: string) => text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");

describe.each(ENTRIES)("%s in a browser that is not Next's", (entry) => {
  const { seen, packages } = graph(join(SRC, entry));

  it("never touches process, anywhere it imports", () => {
    expect(seen.size).toBeGreaterThan(0);
    const bad = [...seen].filter((f) => /\bprocess\s*\./.test(strip(readFileSync(f, "utf8"))));
    expect(bad.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it("imports no Node built-in", () => {
    expect([...packages].filter((p) => p.startsWith("node:"))).toEqual([]);
  });
});
