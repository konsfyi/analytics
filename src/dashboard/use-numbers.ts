"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Numbers } from "../types.js";
import { WINDOWS, windowOf, type Window } from "../windows.js";

// Keeping the figures current, which is the whole reason the dashboard is on
// the client: it asks the route for a window's numbers every 30 seconds and
// whenever the tab is looked at again, and switching windows is a fetch and a
// pushState rather than a navigation — a navigation would throw the page away
// and there would be nothing left to animate.
//
// It is a hook rather than part of the dashboard so that a host can put the
// window switcher wherever its own chrome wants it (play.kons.design puts it
// in its page header) while the same code keeps the numbers moving.

const EVERY = 30_000; // how often the numbers are asked for again

// A private dashboard opened with ?token= has to keep it: on every refresh of
// the numbers, and in the URL a window switch writes. The token is already in
// the address bar, so carrying it along shows it to nobody new.
const withToken = (url: string) => {
  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
};

export type Live = {
  numbers: Numbers;
  window: Window;
  setWindow: (w: Window) => void;
  /** Whether a change should animate. False until the figures on screen belong
      to the window the URL asks for — see below. */
  live: boolean;
};

export function useNumbers(
  initial: Numbers,
  initialWindow: Window,
  /** Where to ask, and where the window lives in the URL. */
  at = "/api/analytics",
  path = "/analytics",
): Live {
  const [key, setKey] = useState<Window>(initialWindow);
  const [numbers, setNumbers] = useState(initial);
  // Nothing animates until the figures on screen belong to the window the URL
  // asks for. They may not at first: the page is rendered on the server for
  // whatever the URL said when it was fetched, and this can mount again over a
  // pushState (a Fast Refresh in development, anything that remounts the tree),
  // which would otherwise put the earlier window's numbers up and animate the
  // right ones in over them — the bars appearing to jump.
  const [live, setLive] = useState(false);

  // Only the newest answer counts. Switching windows while a poll is in the
  // air used to let the older reply land last — the chart would take the new
  // shape, then jump back to the old one for a beat.
  const asked = useRef(0);
  const load = useCallback(
    async (w: Window) => {
      const mine = ++asked.current;
      try {
        const res = await fetch(withToken(`${at}${WINDOWS[w].query}`), {
          cache: "no-store",
        });
        if (res.ok && mine === asked.current)
          setNumbers((await res.json()) as Numbers);
      } catch {
        /* the next tick will try again */
      }
    },
    [at],
  );

  // Every 30 seconds, and once more whenever the tab is looked at again.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load(key);
    };
    const timer = setInterval(tick, EVERY);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [key, load]);

  // What is on screen right now, for the listener below to compare against.
  const showing = useRef(initialWindow);
  useEffect(() => {
    showing.current = key;
  }, [key]);

  const setWindow = useCallback(
    (w: Window) => {
      if (w === showing.current) return;
      setKey(w);
      window.history.pushState(null, "", withToken(`${path}${WINDOWS[w].query}`));
      void load(w);
    },
    [load, path],
  );

  useEffect(() => {
    let alive = true;
    const follow = () => {
      const w = windowOf(window.location.search);
      if (w === showing.current) return;
      setKey(w);
      void load(w);
    };
    window.addEventListener("popstate", follow);
    // On mount the URL decides; only once its numbers are up does anything
    // start animating.
    const wanted = windowOf(window.location.search);
    if (wanted === initialWindow) {
      // already the right numbers: from the next frame on, changes animate
      const t = setTimeout(() => alive && setLive(true), 0);
      return () => {
        alive = false;
        clearTimeout(t);
        window.removeEventListener("popstate", follow);
      };
    }
    // the numbers first, the tab and the animations with them
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is an outside source; this is the one-time catch-up to it
    void load(wanted).then(() => {
      if (!alive) return;
      setKey(wanted);
      // a tick later, so the corrected figures are painted before anything is
      // allowed to animate — the catch-up itself must not look like a change
      setTimeout(() => alive && setLive(true), 0);
    });
    return () => {
      alive = false;
      window.removeEventListener("popstate", follow);
    };
  }, [initialWindow, load]);

  return { numbers, window: key, setWindow, live };
}
