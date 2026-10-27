// D-037: the three themes (the `theme` enum in packages/db/src/schema.ts), set on <html data-theme>.
export const themes = ["light", "dark", "night_owl"] as const;
export type Theme = (typeof themes)[number];

export const themeLabels: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  night_owl: "Night Owl",
};
