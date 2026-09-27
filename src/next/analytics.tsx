"use client";

import { usePathname } from "next/navigation.js";
import { useEffect, useRef, type ReactNode } from "react";
import {
  applySwitch,
  configure,
  listen,
  pageview,
  track,
  type TrackerOptions,
} from "../client/tracker.js";

// The tracker, as a Next app wants it: put <Analytics site="example.com" /> in
// the root layout once. A view is sent whenever the route changes, and the last
// word when the tab goes away — see client/tracker.ts for everything it does
// and everything it will not.
//
// The options are props rather than environment variables on purpose: the
// tracker runs in the browser, where only a bundler can fill in `process.env`,
// and a package cannot count on which one it is under.

export function Analytics(props: TrackerOptions) {
  // Before any effect below, and before a track() anywhere in the page.
  configure(props);

  const path = usePathname();
  const current = useRef(path);
  useEffect(() => {
    current.current = path;
  }, [path]);

  useEffect(() => {
    applySwitch();
    return listen(() => current.current);
  }, []);

  useEffect(() => {
    pageview(path);
  }, [path]);

  return null;
}

/** Records a click on whatever it wraps — for links inside server-rendered
    pages, which cannot carry a handler of their own. Lays out as nothing. */
export function Track({
  event,
  data,
  children,
}: {
  event: string;
  data?: Record<string, string | number | boolean>;
  children: ReactNode;
}) {
  return (
    <span style={{ display: "contents" }} onClick={() => track(event, data)}>
      {children}
    </span>
  );
}

export { track };
