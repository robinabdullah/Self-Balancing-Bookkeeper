"use client";

import Link from "next/link";
import { CircleUserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Alert } from "@mbl/domain/alert-level";
import type { Breakdown } from "@mbl/domain/dashboard";
import { signOut } from "@/server/actions/auth";
import { AlertsBell } from "./alerts-bell";
import { BalanceChip } from "./balance-chip";
import { BusinessLogo } from "./business-logo";

// UIDD §3: the business's logo and name (D-039), books-balance chip, "Closing: …", the 🔔 Alerts
// (D-079) and the user menu. On mobile only the name, the chip and the 🔔; "Closing: …" and Sign
// out are in More.
export function TopBar({
  name,
  logo,
  email,
  closing,
  balance,
  alerts,
}: {
  name: string;
  logo: string | null;
  email: string;
  closing: { label: string; href: string };
  balance: Breakdown;
  alerts: { alerts: Alert[]; noExpiryCards: number };
}) {
  return (
    <header className="bg-background sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4">
      <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 font-semibold">
        {logo && <BusinessLogo src={logo} size={28} />}
        <span className="truncate">{name}</span>
      </Link>
      <BalanceChip balance={balance} />
      <div className="ml-auto flex items-center gap-1 lg:gap-3">
        <Link
          href={closing.href}
          className="text-muted-foreground hover:text-foreground hidden min-h-11 items-center text-sm lg:flex"
        >
          {closing.label}
        </Link>
        <AlertsBell alerts={alerts.alerts} noExpiryCards={alerts.noExpiryCards} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="hidden size-11 lg:inline-flex"
              aria-label="User menu"
            >
              <CircleUserIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-muted-foreground font-normal">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" onSelect={() => void signOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
