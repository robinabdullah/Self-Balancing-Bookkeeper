import { accountTabs } from "./nav";
import { SegmentedNav } from "./segmented-nav";

// UIDD §3: Accounts has tabs: Customers · Suppliers · Cards · People.
export function AccountTabs({ current }: { current: string }) {
  return (
    <SegmentedNav
      label="Accounts"
      className="mb-4"
      items={accountTabs.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
