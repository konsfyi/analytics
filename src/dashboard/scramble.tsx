"use client";

import { useEffect, useState } from "react";

// Text that arrives a symbol at a time: what has not been revealed yet is
// churning nonsense — hashes, slashes, digits — replaced letter by letter from
// the left. Fast (a character every other frame), so a row's label lands in
// well under half a second and it reads as the number being dealt rather than
// as an effect.

const GLYPHS = "#%&$@/\\|<>_+*=~^01234567890abcdef";
const EVERY = 2; // frames per character

export function Scramble({ text, run }: { text: string; run: boolean }) {
  // The churn the text is being dealt out of while it runs; a label that was
  // already there is simply itself. `run` is decided at mount, and so is the
  // text that gets dealt — a later text change swaps instantly, like the rest
  // of the page (remount with a key to deal it again).
  const [dealing, setDealing] = useState<string | null>(run ? "" : null);
  const [target] = useState(text);

  useEffect(() => {
    if (!run) return;
    let letters = 0;
    let frame = 0;
    let raf = 0;
    const tick = () => {
      const noise = Array.from(target.slice(letters), (c) =>
        c === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      ).join("");
      setDealing(target.slice(0, letters) + noise);
      if (++frame % EVERY === 0) letters++;
      if (letters <= target.length) raf = requestAnimationFrame(tick);
      else setDealing(null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target]);

  return <>{dealing ?? text}</>;
}
