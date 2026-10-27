import { WHITE, bankOf } from "@/lib/banks";
import { cn } from "@/lib/utils";

// D-032, D-033: a card's bank as a small badge in its logo's colours. It doesn't repeat the Type
// (D-053): the text beside it names the card with its Type, so colour is never the only signal
// (UIDD §6). On a multi-colour badge, white text gets a soft shadow to stay readable on each band.
export function BankBadge({ name, className }: { name: string; className?: string }) {
  const bank = bankOf(name);
  const shadow = bank.stops.length > 1 && bank.text === WHITE;
  return (
    <span
      aria-hidden
      data-bank={bank.short}
      className={cn(
        "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 align-middle text-[10px] leading-none font-bold",
        className,
      )}
      style={{
        background: bank.background,
        color: bank.text,
        textShadow: shadow ? "0 1px 2px rgb(0 0 0 / 0.55)" : undefined,
      }}
    >
      {bank.short}
    </span>
  );
}
