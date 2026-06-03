import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isPriceStale, priceFreshnessLabel } from "@/lib/price-freshness";

export const dynamic = "force-dynamic";

type FetchLog = {
  id: number;
  job_name: string;
  status: string;
  records_fetched: number | null;
  records_failed: number | null;
  failed_tickers: string[] | null;
  error_message: string | null;
  executed_at: string;
};

type PriceRow = {
  ticker: string;
  price: number;
  fetched_at: string;
  stocks: { name: string; sector: string | null } | null;
};

function fmtTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " ET";
}

export default async function DataHealthPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail || user?.email !== adminEmail) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-10">
        <div className="card rounded-xl p-6">
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Data Health</h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
            Admin access required. Set <code>ADMIN_EMAIL</code> and sign in with that account.
          </p>
        </div>
      </div>
    );
  }

  const admin = createSupabaseAdmin();
  const [{ data: logs }, { data: prices }] = await Promise.all([
    admin.from("fetch_logs").select("*").order("executed_at", { ascending: false }).limit(30),
    admin.from("stock_prices").select("ticker, price, fetched_at, stocks(name, sector)").order("fetched_at", { ascending: true }).limit(500),
  ]);

  const typedLogs = (logs ?? []) as FetchLog[];
  const typedPrices = (prices ?? []) as unknown as PriceRow[];
  const latestByJob = new Map<string, FetchLog>();
  for (const log of typedLogs) {
    if (!latestByJob.has(log.job_name)) latestByJob.set(log.job_name, log);
  }
  const stalePrices = typedPrices.filter((row) => isPriceStale(row.fetched_at)).slice(0, 25);
  const settlement = latestByJob.get("prices_close_settlement");

  return (
    <div className="max-w-6xl mx-auto px-5 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Data Health</h1>
        <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
          Price freshness, cron logs, and settlement-close visibility.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {["prices", "crypto_prices", "prices_close_settlement"].map((job) => {
          const log = latestByJob.get(job);
          return (
            <div key={job} className="card rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>{job}</p>
              <p className="text-sm font-semibold mt-2" style={{ color: log?.status === "success" ? "var(--up)" : "var(--accent)" }}>
                {log?.status ?? "No log"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>{fmtTime(log?.executed_at)}</p>
              <p className="text-[11px] mt-2" style={{ color: "var(--text-3)" }}>
                fetched {log?.records_fetched ?? 0} · failed {log?.records_failed ?? 0}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card rounded-xl p-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Stale Prices</h2>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>Flags assets older than 20 minutes.</p>
          <div className="mt-3 space-y-2">
            {stalePrices.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>No stale prices found.</p>
            ) : stalePrices.map((row) => (
              <div key={row.ticker} className="flex items-center justify-between gap-3 text-xs">
                <span style={{ color: "var(--text)" }}>{row.ticker}</span>
                <span style={{ color: "var(--text-3)" }}>{priceFreshnessLabel(row.fetched_at)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card rounded-xl p-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Settlement Close</h2>
          <p className="text-xs mt-2" style={{ color: "var(--text-2)" }}>
            {settlement
              ? `Last settlement close ${settlement.status} at ${fmtTime(settlement.executed_at)} with ${settlement.records_fetched ?? 0} records fetched.`
              : "No settlement-close log in the latest 30 fetch logs."}
          </p>
          {settlement?.failed_tickers && settlement.failed_tickers.length > 0 && (
            <p className="text-[11px] mt-2" style={{ color: "var(--down)" }}>
              Failed: {settlement.failed_tickers.slice(0, 12).join(", ")}
            </p>
          )}
        </section>
      </div>

      <section className="card rounded-xl p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Recent Fetch Logs</h2>
        <table className="w-full text-xs">
          <thead style={{ color: "var(--text-3)" }}>
            <tr><th className="text-left py-2">Job</th><th>Status</th><th>Fetched</th><th>Failed</th><th className="text-left">Executed</th></tr>
          </thead>
          <tbody>
            {typedLogs.map((log) => (
              <tr key={log.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="py-2" style={{ color: "var(--text)" }}>{log.job_name}</td>
                <td className="text-center" style={{ color: log.status === "success" ? "var(--up)" : "var(--accent)" }}>{log.status}</td>
                <td className="text-center tabular-nums" style={{ color: "var(--text-2)" }}>{log.records_fetched ?? 0}</td>
                <td className="text-center tabular-nums" style={{ color: (log.records_failed ?? 0) > 0 ? "var(--down)" : "var(--text-2)" }}>{log.records_failed ?? 0}</td>
                <td style={{ color: "var(--text-3)" }}>{fmtTime(log.executed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
