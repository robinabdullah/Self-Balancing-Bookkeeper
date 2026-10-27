import { CustomerCards } from "@/components/charts/customer-cards";
import { MoneyCards } from "@/components/charts/money-cards";
import { PeriodChips } from "@/components/charts/period-chips";
import { ProfitCards } from "@/components/charts/profit-cards";
import { ReportSheet } from "@/components/report/report-sheet";
import { StockCards } from "@/components/charts/stock-cards";
import { SegmentedNav } from "@/components/shell/segmented-nav";
import { periodQuery } from "@/lib/charts/period";
import { monthOf } from "@/lib/dates";
import { withQuery } from "@/lib/href";
import {
  loadChartPeriod,
  loadCustomerCharts,
  loadMoneyCharts,
  loadProfitCharts,
  loadStockCharts,
} from "@/server/charts";

// D-064 (UIDD §4.17): the Charts page, on screen only (no ⤴ Share). Tabs `?tab=` (Profit first),
// then the period row (`?period=`, or a custom `?from=&to=` from the Report sheet's View on
// screen). `?report=1` opens the Report sheet. The window starts no earlier than the oldest entry
// (the opening) and ends today. Profit's cards are CR-041, Money's CR-042, Customers' CR-043,
// Stock's CR-044 (Stock age is today's stock whatever the window).
const TABS = [
  ["profit", "Profit"],
  ["money", "Money"],
  ["customers", "Customers"],
  ["stock", "Stock"],
] as const;

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const base = await loadChartPeriod(sp);
  const { today, firstDate, period } = base;
  const tab = TABS.find(([key]) => key === sp.tab)?.[0] ?? "profit";

  const tabParam = (key: string) => (key === "profit" ? null : key);
  const range = periodQuery(period);
  const path = withQuery("/reports/charts", { tab: tabParam(tab) });
  const current = withQuery(path, range);
  const profit = tab === "profit" ? await loadProfitCharts(base) : null;
  const money = tab === "money" ? await loadMoneyCharts(base) : null;
  const customers = tab === "customers" ? await loadCustomerCharts(base) : null;
  const stock = tab === "stock" ? await loadStockCharts(base) : null;
  const detail = (chart: string) => withQuery(`/reports/charts/${chart}`, range);

  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Charts</h1>
      <SegmentedNav
        label="Charts"
        items={TABS.map(([key, label]) => ({
          href: withQuery("/reports/charts", { tab: tabParam(key), ...range }),
          label,
          current: key === tab,
        }))}
      />
      <PeriodChips path={path} current={current} period={period} />
      {profit ? (
        <ProfitCards charts={profit.charts} period={period} window={profit.window} href={detail} />
      ) : money ? (
        <MoneyCards
          charts={money.charts}
          period={period}
          window={money.window}
          people={money.people}
          href={detail}
        />
      ) : customers ? (
        <CustomerCards
          charts={customers.charts}
          period={period}
          names={customers.names}
          href={detail}
        />
      ) : (
        stock && <StockCards charts={stock.charts} names={stock.names} href={detail} />
      )}

      {sp.report && (
        <ReportSheet
          base={current}
          target={path}
          first={monthOf(firstDate)}
          today={today}
          title="Charts"
          send={null}
        />
      )}
    </>
  );
}
