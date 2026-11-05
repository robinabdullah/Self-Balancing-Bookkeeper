// SRS §15, UIDD §3 (D-079): an alert's shape and its level's word and colours. Apart from the
// rules (`alerts.ts`), so the client bell and the card page's chip don't bundle the engine.

export type AlertLevel = "urgent" | "soon" | "fyi";
export type AlertKind = "card_fee" | "card_bill" | "customer" | "close" | "stock" | "profit";
export type Alert = {
  level: AlertLevel;
  kind: AlertKind;
  title: string;
  detail: string;
  href: string;
  /** The day it is about ("YYYY-MM-DD"); orders alerts within a level. */
  date: string;
  /** Fee and bill alerts: the card, so its page can show its own. */
  cardId?: string;
};

/**
 * UIDD §3, §6: each level's word and colours (the card status badge's red / amber / blue); colour
 * always backs up the word. `tone` = a chip or row badge, `dot` = the small coloured dot.
 */
export const LEVEL: Record<AlertLevel, { label: string; tone: string; dot: string }> = {
  urgent: {
    label: "Urgent",
    tone: "border-destructive bg-destructive text-destructive-foreground",
    dot: "bg-destructive",
  },
  soon: {
    label: "Soon",
    tone: "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  fyi: { label: "FYI", tone: "border-sky-500 text-sky-800 dark:text-sky-300", dot: "bg-sky-500" },
};
export const LEVELS: AlertLevel[] = ["urgent", "soon", "fyi"];

/** Urgent + Soon: the bell's badge. */
export const badgeCount = (alerts: Alert[]) => alerts.filter((a) => a.level !== "fyi").length;
