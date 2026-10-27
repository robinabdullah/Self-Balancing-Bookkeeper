// D-032, D-033, D-053: a card's bank badge (the bank's colours behind its short name), read from
// the card's name ("EBL", "City"). It doesn't show the Type: the text beside it does (D-036). The
// card Types live here too. A name the table doesn't know gets its initials on a neutral
// colour. The badge stands in for the bank's logo, so it follows the logo's colours (the partners
// checked the current banks', 2026-10-09): one colour, a split, or a gradient. The text is white or
// dark, whichever reads better where it sits (tested).

type Fill = { stops: string[]; style: "solid" | "split" | "gradient" };
export type Bank = {
  short: string;
  /** CSS `background` for the badge. */
  background: string;
  /** The badge's colours, for the contrast check. */
  stops: string[];
  text: string;
};

const solid = (color: string): Fill => ({ stops: [color], style: "solid" });
const split = (...stops: string[]): Fill => ({ stops, style: "split" });
const gradient = (...stops: string[]): Fill => ({ stops, style: "gradient" });

const BANKS: [RegExp, string, Fill][] = [
  // The partners' current banks, from their logos.
  [/\b(sebl|southeast)\b/, "SEBL", split("#0088cc", "#b72c91")], // a blue S and a magenta B
  [/\b(ebl|eastern)\b/, "EBL", solid("#ffc10e")], // EBL yellow
  [/\b(mtb|mutual trust)\b/, "MTB", gradient("#e8185e", "#8b3a9c", "#12a1a4", "#3dbe6e")], // 2025 logo
  [/\bprime\b/, "Prime", split("#b31217", "#156535", "#2e4fa3")], // the three-part triangle
  [/\b(scb|standard chartered|stanchart)\b/, "SCB", split("#0473ea", "#0473ea", "#38d200")],
  [/\bcity\b/, "City", solid("#c8102e")],
  [/\bbrac\b/, "BRAC", solid("#006cb6")],
  [/\b(ucb|united commercial)\b/, "UCB", solid("#d01920")],
  // The opening's other banks (D-035), sampled from their logos.
  [/\bmeghna\b/, "MBL", solid("#62259a")], // Meghna purple
  [/\bbank asia\b/, "BA", solid("#1f5fb0")], // Bank Asia blue
  [/\b(lanka ?bangla|lbf)\b/, "LBF", split("#0b8a45", "#0b8a45", "#f7941d")], // green, orange stripe
  // Others the partners may add later (approximate colours).
  [/\b(dbbl|dutch[- ]?bangla)\b/, "DBBL", solid("#2e7d32")],
  [/\bhsbc\b/, "HSBC", solid("#b8000e")],
  [/\bdhaka bank\b/, "DB", solid("#004b87")],
  [/\bncc\b/, "NCC", solid("#1565c0")],
  [/\bone bank\b/, "One", solid("#9c1c26")],
  [/\btrust bank\b/, "TBL", solid("#4a6b1f")],
  [/\bjamuna\b/, "JBL", solid("#0b6e4f")],
  [/\bpubali\b/, "PBL", solid("#3e2a7e")],
  [/\bific\b/, "IFIC", solid("#00467f")],
  [/\b(islami|ibbl)\b/, "IBBL", solid("#1b5e20")],
];

/** The card Types Setup offers (D-036), as stored in `cards.network`. */
export const CARD_NETWORKS = ["visa", "mastercard", "amex", "none"] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];
export const NETWORK_LABEL: Record<CardNetwork, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  none: "None",
};
// A Type's words in a card name, for "Remove 'Visa' from the name" and not saying it twice.
const NETWORK_WORD: Record<Exclude<CardNetwork, "none">, RegExp> = {
  visa: /\bvisa\b/i,
  mastercard: /\bmaster(card)?\b/i,
  amex: /\b(amex|american express)\b/i,
};

/** The Type word the name already holds ("EBL Visa" + visa → "Visa"), or null. */
export function typeWordIn(name: string, network: CardNetwork): string | null {
  if (network === "none") return null;
  return name.match(NETWORK_WORD[network])?.[0] ?? null;
}

/** The Type a name names: one network → it; none or both ("visa/master") → "none". */
export function networkOf(name: string): CardNetwork {
  const named = (Object.keys(NETWORK_WORD) as Exclude<CardNetwork, "none">[]).filter((n) =>
    NETWORK_WORD[n].test(name),
  );
  return named.length === 1 ? named[0] : "none";
}

export const NEUTRAL = "#52525b";
export const WHITE = "#ffffff";
export const DARK = "#1f1d1e";
const NETWORK_WORDS = /^(visa|amex|american|express|master|mastercard|unionpay|union|pay|card)$/;

/** WCAG relative luminance of "#rrggbb". */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The colours under the badge's short name: its middle band(s). */
export const middle = (stops: string[]) =>
  stops.length % 2
    ? [stops[(stops.length - 1) / 2]]
    : stops.slice(stops.length / 2 - 1, stops.length / 2 + 1);

/** White or dark text: whichever has the better worst-case contrast under the text. */
const textOn = (stops: string[]) => {
  const worst = (text: string) => Math.min(...middle(stops).map((s) => contrast(text, s)));
  return worst(WHITE) >= worst(DARK) ? WHITE : DARK;
};

function background({ stops, style }: Fill) {
  if (style === "solid") return stops[0];
  if (style === "gradient") return `linear-gradient(120deg, ${stops.join(", ")})`;
  // Hard-edged bands, like the logos' separate shapes.
  const step = 100 / stops.length;
  const bands = stops.map((s, i) => `${s} ${i * step}% ${(i + 1) * step}%`);
  return `linear-gradient(120deg, ${bands.join(", ")})`;
}

const bank = (short: string, fill: Fill): Bank => ({
  short,
  background: background(fill),
  stops: fill.stops,
  text: textOn(fill.stops),
});

/** The bank badge for a card name (case and spacing don't matter). */
export function bankOf(name: string): Bank {
  const text = name.toLowerCase().replace(/\s+/g, " ").trim();
  const known = BANKS.find(([re]) => re.test(text));
  if (known) return bank(known[1], known[2]);
  const initials = text
    .split(" ")
    .filter((w) => w && !NETWORK_WORDS.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return bank(initials || "?", solid(NEUTRAL));
}

/** Every badge's colours and text, for the contrast test. */
export const allBadges = () => [
  ...BANKS.map(([, short, fill]) => bank(short, fill)),
  bank("?", solid(NEUTRAL)),
];
