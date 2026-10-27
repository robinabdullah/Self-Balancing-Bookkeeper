"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

// D-035 (UIDD §1): on a phone, Back closes the top open sheet and stays on the page. Each open
// sheet owns a same-URL history entry (pushed through Next's patched pushState, so Next keeps its
// own state in it). Back pops it and closes that sheet only; closing any other way (✕, Escape, a
// pick, Save) removes the entry with `history.go(-1)`. A sheet that opens as another closes in
// the same click (picker → "+ Add new") takes over that entry instead. A link that leaves from
// inside a sheet replaces the entry (`SheetLink`), so there is never a double Back.

type Entry = { id: number; close: () => void; closed: boolean };

const entries: Entry[] = []; // ours, in history order: the top one is the current history entry
let seq = 0;
let skipPops = 0; // pops caused by our own history.go()
let flushing: ReturnType<typeof setTimeout> | null = null;
let listening = false;

const isTop = (e: Entry) => window.history.state?.sheet === e.id;

/** Fired after Back (or a close) took a sheet's history entry away; see `replaceUrl`. */
export const SHEET_POP = "sheetpop";

function onPopState() {
  if (skipPops > 0) skipPops--;
  else {
    const top = entries.pop();
    if (!top) return; // not ours: a page's own history
    if (!top.closed) {
      top.closed = true;
      top.close();
    }
  }
  window.dispatchEvent(new Event(SHEET_POP));
}

/** Drop the closed entries on top: one Back for all of them, unless a navigation replaced them. */
function flush() {
  flushing = null;
  let n = 0;
  while (n < entries.length && entries[entries.length - 1 - n].closed) n++;
  if (n === 0) return;
  const top = entries[entries.length - 1];
  entries.splice(entries.length - n, n);
  if (!isTop(top)) return;
  skipPops++;
  window.history.go(-n);
}

/** `close` shuts the sheet on Back; with `enabled` false the sheet keeps no history entry. */
export function useBackClose(open: boolean, close: () => void, enabled = true) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open || !enabled) return;
    if (!listening) {
      window.addEventListener("popstate", onPopState);
      listening = true;
    }
    const me: Entry = { id: ++seq, close: () => closeRef.current(), closed: false };
    const last = entries[entries.length - 1];
    if (flushing && last?.closed && isTop(last)) {
      entries[entries.length - 1] = me; // take over the entry of the sheet that just closed
      window.history.replaceState({ sheet: me.id }, "");
    } else {
      entries.push(me);
      window.history.pushState({ sheet: me.id }, "");
    }
    return () => {
      if (me.closed) return; // closed by Back, or left by a link: nothing to remove
      me.closed = true;
      if (!flushing) flushing = setTimeout(flush, 0);
    };
  }, [open, enabled]);
}

/**
 * `history.replaceState` to a new URL (Next follows it) that keeps an open sheet's entry ours. A
 * page that does this while a sheet is open re-applies its URL on `SHEET_POP`, since the entry
 * Back returns to still has the URL from before the sheet opened.
 */
export function replaceUrl(url: string) {
  const sheet = window.history.state?.sheet;
  window.history.replaceState(sheet ? { sheet } : null, "", url);
}

/** A link inside a sheet is leaving: its navigation replaces the sheets' entry, so no Back. */
export function leaveSheet() {
  for (const e of entries) e.closed = true;
  entries.length = 0;
}

/** A link inside a sheet: it replaces the sheet's history entry with the new page. */
export function SheetLink({ onClick, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      replace
      {...props}
      onClick={(e) => {
        leaveSheet();
        onClick?.(e);
      }}
    />
  );
}
