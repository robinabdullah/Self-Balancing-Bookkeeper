import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

// UIDD §4.8 (task 4.3): a customer's or supplier's detail header: back to the list, the name, the
// due ("Owes ৳X" / "We owe ৳X"), then the contact block: phone (tap to call), email, address, and
// last the quick actions (D-032). A card shows its bank badge before the name.

type Props = {
  back: { href: string; label: string };
  name: string;
  due: string;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  /** Shown before the name (a card's bank badge). */
  badge?: React.ReactNode;
  /** The quick actions, under everything else. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

export function AccountHeader({
  back,
  name,
  due,
  phone,
  email,
  address,
  badge,
  actions,
  children,
}: Props) {
  return (
    <>
      <Link
        href={back.href}
        className="text-primary -ml-1 flex min-h-11 w-fit items-center gap-1 text-sm"
      >
        <ChevronLeftIcon aria-hidden className="size-4" /> {back.label}
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        {badge}
        {name}
      </h1>
      <p className="mt-1 text-lg font-semibold tabular-nums">{due}</p>
      {children}
      {(phone || email || address) && (
        <address className="text-muted-foreground mt-2 flex flex-col text-sm not-italic">
          {phone && (
            <a href={`tel:${phone}`} className="text-primary flex min-h-11 w-fit items-center">
              {phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="text-primary flex min-h-11 w-fit items-center">
              {email}
            </a>
          )}
          {address && <span>{address}</span>}
        </address>
      )}
      {actions}
    </>
  );
}
