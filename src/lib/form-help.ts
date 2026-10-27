"use client";

import { useSyncExternalStore } from "react";

// UIDD §3: Settings → Form help sets how "About this form" starts on every form. Saved in the
// browser, per device; the default is Expanded.
export const formHelpModes = ["expanded", "collapsed", "off"] as const;
export type FormHelpMode = (typeof formHelpModes)[number];

const KEY = "form-help";
const CHANGE = "form-help-change";
const DEFAULT: FormHelpMode = "expanded";

function isMode(value: unknown): value is FormHelpMode {
  return formHelpModes.includes(value as FormHelpMode);
}

function read(): FormHelpMode {
  try {
    const value = localStorage.getItem(KEY);
    return isMode(value) ? value : DEFAULT;
  } catch {
    return DEFAULT; // storage blocked (private mode): fall back to the default
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

export function setFormHelp(mode: FormHelpMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Not saved; the choice still applies until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function useFormHelp(): FormHelpMode {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}
