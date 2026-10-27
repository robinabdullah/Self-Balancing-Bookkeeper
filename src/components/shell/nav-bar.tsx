"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookmarkIcon,
  BookOpenTextIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  EllipsisIcon,
  HouseIcon,
  PackageIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { accountTabs, moreLinks } from "./nav";
import { MoreSheet, NewSheet } from "./nav-sheets";

const itemClass =
  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-lg lg:px-3 lg:text-sm lg:hover:bg-muted [&_svg]:size-5";
const activeClass = "font-medium text-foreground lg:bg-muted";

// UIDD §3: bottom tab bar on mobile: Home · New · Stock · Accounts · More; More is highlighted on
// its screens (D-032), and on Export (Reports' Backup all data, D-043). The sidebar at ≥ 1024px
// lists More's screens directly, each with an icon, and has no More: "Closing: …" and Sign out are
// in the top bar (D-062).
const sidebarIcons: Record<string, React.ReactNode> = {
  "/months": <CalendarDaysIcon />,
  "/journal": <BookOpenTextIcon />,
  "/reports": <ChartColumnIcon />,
  "/saved": <BookmarkIcon />,
  "/setup": <WrenchIcon />,
  "/settings": <SettingsIcon />,
};

export function NavBar({ closing }: { closing: { label: string; href: string } }) {
  const path = usePathname();
  const on = (href: string) =>
    path.startsWith(href) || (href === "/reports" && path.startsWith("/export"));
  const onMore = moreLinks.some((l) => on(l.href));
  const tab = (label: string, href: string, icon: React.ReactNode, active: boolean) => (
    <Link
      href={href}
      className={cn(itemClass, active && activeClass)}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <nav
      aria-label="Main"
      className="bg-background fixed inset-x-0 bottom-0 z-40 flex h-16 border-t pb-[env(safe-area-inset-bottom)] lg:top-14 lg:right-auto lg:h-auto lg:w-56 lg:flex-col lg:gap-1 lg:border-t-0 lg:border-r lg:p-3"
    >
      {tab("Home", "/", <HouseIcon />, path === "/")}
      <NewSheet
        triggerClass={itemClass}
        trigger={
          <>
            <PlusIcon />
            New
          </>
        }
      />
      {tab("Stock", "/stock", <PackageIcon />, path.startsWith("/stock"))}
      {tab(
        "Accounts",
        accountTabs[0].href,
        <UsersIcon />,
        accountTabs.some((t) => path.startsWith(t.href)),
      )}
      {moreLinks.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(itemClass, "hidden lg:flex", on(l.href) && activeClass)}
          aria-current={on(l.href) ? "page" : undefined}
        >
          {sidebarIcons[l.href]}
          {l.label}
        </Link>
      ))}
      <MoreSheet
        closing={closing}
        triggerClass={cn(itemClass, "lg:hidden", onMore && "text-foreground font-medium")}
        trigger={
          <>
            <EllipsisIcon />
            More
          </>
        }
      />
    </nav>
  );
}
