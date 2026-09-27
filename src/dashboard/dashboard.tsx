"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MAX_ROWS } from "../config.js";
import { duration, type Count } from "../summary.js";
import type { Numbers as Figures } from "../types.js";
import { WINDOWS, WINDOW_KEYS, type Window } from "../windows.js";
import { Scramble } from "./scramble.js";
import { useNumbers, type Live } from "./use-numbers.js";

// The dashboard. It is on the client so the numbers can move rather than be
// redrawn, and it brings its own styling — dashboard.css, plain CSS on custom
// properties, no framework and no tokens from anywhere — so it can sit inside a
// designed site or on its own in an empty page and look like it belongs in both.
// The stylesheet is its own import (`@konsfyi/analytics/dashboard.css`), so the
// host decides where it goes in the cascade.
//
// How a change arrives:
// - a bar that is already there travels to its new width, it does not jump;
// - a row that is new opens its own space (0fr → 1fr, so everything under it
//   slides down), its label is dealt symbol by symbol, and 50ms after that
//   starts its bar grows out of nothing;
// - a new column in the chart rises into place the same way.
// None of it runs on the first paint: what was there when the page loaded is
// simply there.
//
// Two ways in. <Dashboard> is the whole page, header and window tabs included —
// what a site that just wants its numbers somewhere should use. <Numbers> is
// the figures alone, driven by useNumbers(), for a host with chrome of its own
// to put the window switcher in (play.kons.design renders it that way, with the
// tabs in its own page header).

const BAR_AFTER = 50; // ms between a label starting and its bar growing
const SHOWN = 4; // rows a list shows before it offers the rest

/* ---------- the pieces ---------- */

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="an-tile">
      <span className="an-tile-label">{label}</span>
      <span className="an-tile-value">{value}</span>
    </div>
  );
}

// A row that mounts while the page is live is a row that just arrived: the ones
// already on screen keep their place in the list (they are keyed by label) and
// only ever re-render, so there is nothing else to tell them apart by.
function Row({ row, live }: { row: Count; live: boolean }) {
  const [fresh] = useState(live);
  const [open, setOpen] = useState(!live);
  const [grown, setGrown] = useState(!live);
  useEffect(() => {
    if (!fresh) return;
    const frame = requestAnimationFrame(() => setOpen(true));
    const bar = setTimeout(() => setGrown(true), BAR_AFTER);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(bar);
    };
  }, [fresh]);

  return (
    <li className="an-row" data-open={open}>
      <div className="an-row-clip">
        <div className="an-row-body">
          <span
            aria-hidden
            className="an-bar"
            style={{ width: grown ? `${Math.max(row.share, 2)}%` : "0%" }}
          />
          <span className="an-row-label">
            <Scramble text={row.label} run={fresh} />
          </span>
          <span className="an-row-count">
            {row.count}
            <span className="an-row-share">{row.share}%</span>
          </span>
        </div>
      </div>
    </li>
  );
}

function List({
  title,
  rows,
  live,
}: {
  title: string;
  rows: Count[];
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The label is dealt out the way a new row's is, but only on a click — a
  // window switch that changes the count swaps the text instantly, like the
  // rest of the page. `run` is therefore the click that last toggled it.
  const [run, setRun] = useState(0);

  // Four, and then the rest behind a button — unless the rest is a single row,
  // which is not worth asking about.
  const rest = Math.max(rows.length - SHOWN, 0);
  const more = rest >= 2;
  const shown = more && !open ? rows.slice(0, SHOWN) : rows;

  return (
    <section className="an-list">
      <h2 className="an-list-title">{title}</h2>
      {shown.length ? (
        <div className="an-list-body">
          <ul className="an-rows">
            {shown.map((r) => (
              <Row key={r.label} row={r} live={live} />
            ))}
          </ul>
          {more ? (
            <button
              type="button"
              className="an-more"
              onClick={() => {
                setRun((n) => n + 1);
                setOpen((o) => !o);
              }}
            >
              <Scramble
                key={run}
                text={open ? "Hide" : `Show ${rest} more`}
                run={run > 0}
              />
            </button>
          ) : null}
        </div>
      ) : (
        <p className="an-empty">Nothing yet</p>
      )}
    </section>
  );
}

function Column({ share, live }: { share: number; live: boolean }) {
  const [fresh] = useState(live);
  const [grown, setGrown] = useState(!live);
  useEffect(() => {
    if (!fresh) return;
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [fresh]);
  return (
    <span
      className="an-column"
      style={{ height: grown ? `${Math.max(share, 2)}%` : "0%" }}
    />
  );
}

function Chart({
  series,
  live,
}: {
  series: { at: number; views: number }[];
  live: boolean;
}) {
  const top = Math.max(...series.map((s) => s.views), 1);
  return (
    <div className="an-chart">
      {series.map((s) => (
        // The bucketing is part of a column's identity: a midnight bucket has
        // the same timestamp whether the window counts by hours or by days, and
        // sharing a column between the two lets React keep that element — the
        // browser then eases it down from the old height before it comes back
        // up, which is the bar that looked like it was jumping. Within one
        // window the keys hold, so a refresh still moves the bars rather than
        // rebuilding them.
        <Column
          key={`${series.length}:${s.at}`}
          share={(s.views / top) * 100}
          live={live}
        />
      ))}
    </div>
  );
}

/** The window switcher, for the plain version. A host with its own tabs passes
    `setWindow` to them instead and never renders this. */
export function WindowTabs({
  value,
  onChange,
  labels,
}: {
  value: Window;
  onChange: (w: Window) => void;
  labels?: Partial<Record<Window, ReactNode>>;
}) {
  return (
    <div role="tablist" className="an-tabs">
      {WINDOW_KEYS.map((w) => (
        <button
          key={w}
          role="tab"
          type="button"
          aria-selected={w === value}
          className="an-tab"
          onClick={(e) => {
            onChange(w);
            if (e.detail > 0) e.currentTarget.blur();
          }}
        >
          {labels?.[w] ?? WINDOWS[w].label}
        </button>
      ))}
    </div>
  );
}

/* ---------- the figures ---------- */

/**
 * The numbers alone — no header, no window switcher, no scrolling. For a host
 * that has chrome of its own: drive it with useNumbers() and put the switcher
 * wherever that chrome wants it.
 */
export function Numbers({
  numbers: { from, capped, summary: s },
  live,
  backend,
  note,
}: {
  numbers: Figures;
  live: boolean;
  /** Which store the figures were read from, named on the footer. */
  backend: string;
  /** Anything the host wants to add to the footer line. */
  note?: ReactNode;
}) {
  return (
    <div className="an-numbers">
      <div className="an-tiles">
        <Tile label="Visitors" value={String(s.visitors)} />
        <Tile label="Views" value={String(s.views)} />
        <Tile label="Visits" value={String(s.visits)} />
        <Tile label="Bounce" value={`${s.bounce}%`} />
        <Tile label="Visit time" value={duration(s.time)} />
      </div>

      <Chart series={s.series} live={live} />

      <div className="an-lists">
        <List title="Pages" rows={s.pages} live={live} />
        <List title="Channels" rows={s.channels} live={live} />
        <List title="Referrers" rows={s.sources} live={live} />
        <List title="Countries" rows={s.countries} live={live} />
        <List title="Devices" rows={s.devices} live={live} />
        <List title="Events" rows={s.events} live={live} />
        <List title="Systems" rows={s.systems} live={live} />
        <List title="Browsers" rows={s.browsers} live={live} />
        <List title="Screens" rows={s.screens} live={live} />
      </div>

      <p className="an-note">
        Reading the {backend} — {new Date(from).toLocaleString()} to now,
        refreshed every 30 seconds. Every row is kept for good; a visitor id
        lasts a day{note}.
        {capped ? (
          <>
            {" "}
            This window holds more hits than one summary will fold, so these are
            the most recent {MAX_ROWS.toLocaleString()} of them — a floor, not a
            total.
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * The whole page: a header with the window tabs, and the figures. What a site
 * that simply wants its numbers somewhere should render — give it the first set
 * from the server and it keeps itself current from there.
 */
export function Dashboard({
  initial,
  initialWindow,
  backend,
  title = "Analytics",
  at,
  path,
}: {
  initial: Figures;
  initialWindow: Window;
  backend: string;
  title?: string;
  /** Where to ask for the numbers, and where the window lives in the URL. */
  at?: string;
  path?: string;
}) {
  const { numbers, window: key, setWindow, live }: Live = useNumbers(
    initial,
    initialWindow,
    at,
    path,
  );
  return (
    <div className="an">
      <header className="an-header">
        <h1 className="an-title">{title}</h1>
        <WindowTabs value={key} onChange={setWindow} />
      </header>
      <Numbers numbers={numbers} live={live} backend={backend} />
    </div>
  );
}
