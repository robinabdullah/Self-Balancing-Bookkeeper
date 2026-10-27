"use client";

import { type FormHelpMode, formHelpModes, setFormHelp, useFormHelp } from "@/lib/form-help";

const labels: Record<FormHelpMode, string> = {
  expanded: "Expanded",
  collapsed: "Collapsed",
  off: "Off",
};

// UIDD §3, §4.13: Settings → Form help: Expanded · Collapsed · Off.
export function FormHelpSetting() {
  const mode = useFormHelp();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Form help</legend>
      <div className="grid grid-cols-3 gap-2">
        {formHelpModes.map((m) => (
          <label
            key={m}
            className="has-checked:border-primary has-checked:bg-muted has-focus-visible:ring-ring/50 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 text-sm has-focus-visible:ring-3"
          >
            <input
              type="radio"
              name="form-help"
              value={m}
              checked={mode === m}
              onChange={() => setFormHelp(m)}
              className="accent-primary"
            />
            {labels[m]}
          </label>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        How the &ldquo;About this form&rdquo; note starts on every form. Saved on this device.
      </p>
    </fieldset>
  );
}
