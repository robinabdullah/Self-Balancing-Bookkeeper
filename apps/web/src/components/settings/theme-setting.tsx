"use client";

import { useEffect, useState } from "react";
import { type Theme, themeLabels, themes } from "@/lib/themes";
import { setTheme } from "@/server/actions/settings";

const CHANGED_ELSEWHERE = "Your theme was changed on another device — reload the page";

// UIDD §4.13 (D-037): tapping a theme applies it at once and saves it to the user's profile.
// One save at a time, so a quick second tap can't be refused as a conflict.
export function ThemeSetting(props: { id: string; updatedAt: string; theme: Theme }) {
  const [theme, setChoice] = useState(props.theme);
  const [updatedAt, setUpdatedAt] = useState(props.updatedAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A page reached without a full load keeps the old <html data-theme>; show the saved one.
  useEffect(() => {
    document.documentElement.dataset.theme = props.theme;
  }, [props.theme]);

  const apply = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    setChoice(t);
  };
  const choose = async (t: Theme) => {
    const before = theme;
    apply(t);
    setSaving(true);
    const result = await setTheme({ id: props.id, updatedAt, theme: t }).catch(() => null);
    setSaving(false);
    if (result?.status === "ok" && result.updatedAt) {
      setUpdatedAt(result.updatedAt);
      return setError(null);
    }
    apply(before);
    if (result?.status === "invalid") return setError(Object.values(result.errors)[0]);
    setError(result?.status === "conflict" ? CHANGED_ELSEWHERE : "Not saved — try again");
  };

  return (
    <fieldset className="flex flex-col gap-2" disabled={saving} aria-busy={saving}>
      <legend className="mb-2 text-sm font-medium">Theme</legend>
      <div className="grid grid-cols-3 gap-2">
        {themes.map((t) => (
          <label
            key={t}
            className="has-checked:border-primary has-checked:bg-muted has-focus-visible:ring-ring/50 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 text-sm has-focus-visible:ring-3"
          >
            <input
              type="radio"
              name="theme"
              value={t}
              checked={theme === t}
              onChange={() => choose(t)}
              className="accent-primary"
            />
            {themeLabels[t]}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <p className="text-muted-foreground text-xs">Saved to your account (all devices).</p>
    </fieldset>
  );
}
