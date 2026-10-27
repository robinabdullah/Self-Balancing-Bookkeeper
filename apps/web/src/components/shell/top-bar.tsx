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
import type { Breakdown } from "@mbl/domain/dashboard";
import { signOut } from "@/server/actions/auth";
import { BalanceChip } from "./balance-chip";
import { BusinessLogo } from "./business-logo";

// UIDD §3: the business's logo and name (D-039), books-balance chip, "Closing: …", user menu. On
// mobile only the name and the chip; "Closing: …" and Sign out are in More.
export function TopBar({
  name,
  logo,
  email,
  closing,
  balance,
}: {
  name: string;
  logo: string | null;
  email: string;
  closing: { label: string; href: string };
  balance: Breakdown;
}) {
  return (
    <header className="bg-background sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4">
      <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 font-semibold">
        {logo && <BusinessLogo src={logo} size={28} />}
        <span className="truncate">{name}</span>
      </Link>
      <BalanceChip balance={balance} />
      <div className="ml-auto hidden items-center gap-3 lg:flex">
        <Link
          href={closing.href}
          className="text-muted-foreground hover:text-foreground flex min-h-11 items-center text-sm"
        >
          {closing.label}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="size-11" aria-label="User menu">
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
