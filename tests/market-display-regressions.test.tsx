import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import MarketCalendarPage from "@/app/market-calendar/page";
import { StockChart } from "@/components/StockChart";

vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "midnight" }) }));
vi.mock("@/components/DesignProvider", () => ({ useDesign: () => ({ design: "2.0" }) }));

it("explains a chart range with one plotted point after aggregation", () => {
  const html = renderToStaticMarkup(
    <StockChart
      ticker="ANT"
      renderedAt={Date.parse("2026-11-19T22:00:00Z")}
      history={[
        { id: 1, ticker: "ANT", recorded_at: "2026-11-19T20:00:00Z", price: 97 },
        { id: 2, ticker: "ANT", recorded_at: "2026-11-19T21:00:00Z", price: 97.17 },
      ]}
    />,
  );
  expect(html).toContain("Only one price point is available for 1M.");
  expect(html).not.toContain("H: ");
});

it("uses the shared holiday and early-close schedule on the calendar", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2027-12-01T18:00:00Z"));
    const html = renderToStaticMarkup(<MarketCalendarPage />);
    expect(html).not.toContain("2027-12-23");
    expect(html).toContain("2027-12-24");
    expect(html).toContain("2028-07-03");
    expect(html).toMatch(/Early close 1:00\sPM ET/);
  } finally {
    vi.useRealTimers();
  }
});
