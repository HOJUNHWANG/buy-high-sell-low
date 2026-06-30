import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isPriceStale, priceFreshnessLabel } from "@/lib/price-freshness";
import { revalidatePath } from "next/cache";

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

type PriceAnomaly = {
  id: number;
  ticker: string;
  market_date: string;
  price: number;
  provider_change_pct: number | null;
  applied_change_pct: number | null;
  reason: "corporate_action_override" | "extreme_change_suppressed";
  details: string | null;
  status: "open" | "reviewed" | "ignored";
  detected_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
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

function fmtPct(value: number | null) {
  if (value == null) return "Hidden";
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}

function anomalyReasonLabel(reason: PriceAnomaly["reason"]) {
  return reason === "corporate_action_override"
    ? "Corporate action override"
    : "Extreme change suppressed";
}

function marketDateET() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function markPriceAnomalyReviewed(formData: FormData) {
  "use server";

  const anomalyId = Number(formData.get("anomalyId"));
  if (!Number.isInteger(anomalyId) || anomalyId <= 0) {
    throw new Error("Invalid anomaly id");
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !user?.email || user.email !== adminEmail) {
    throw new Error("Admin access required");
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("price_anomalies")
    .update({
      status: "reviewed",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.email,
    })
    .eq("id", anomalyId)
    .eq("status", "open");

  if (error) throw new Error(`Failed to review anomaly: ${error.message}`);
  revalidatePath("/admin/data-health");
}

async function applyPriceAnomalyAdjustment(formData: FormData) {
  "use server";

  const anomalyId = Number(formData.get("anomalyId"));
  const adjustedPct = Number(formData.get("adjustedPct"));
  if (!Number.isInteger(anomalyId) || anomalyId <= 0) {
    throw new Error("Invalid anomaly id");
  }
  if (!Number.isFinite(adjustedPct) || adjustedPct < -100 || adjustedPct > 100) {
    throw new Error("Adjusted percentage must be between -100 and 100");
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !user?.email || user.email !== adminEmail) {
    throw new Error("Admin access required");
  }

  const admin = createSupabaseAdmin();
  const { data: anomaly, error: anomalyError } = await admin
    .from("price_anomalies")
    .select("ticker, market_date")
    .eq("id", anomalyId)
    .single();
  if (anomalyError || !anomaly) {
    throw new Error(`Failed to load anomaly: ${anomalyError?.message ?? "not found"}`);
  }

  const { error: updateError } = await admin
    .from("price_anomalies")
    .update({
      applied_change_pct: adjustedPct,
      status: "reviewed",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.email,
    })
    .eq("id", anomalyId);
  if (updateError) {
    throw new Error(`Failed to apply anomaly adjustment: ${updateError.message}`);
  }

  if (anomaly.market_date === marketDateET()) {
    const { error: priceError } = await admin
      .from("stock_prices")
      .update({ change_pct: adjustedPct })
      .eq("ticker", anomaly.ticker);
    if (priceError) {
      throw new Error(`Failed to update current price change: ${priceError.message}`);
    }
  }

  revalidatePath("/admin/data-health");
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
  const [{ data: logs }, { data: prices }, { data: anomalies }] = await Promise.all([
    admin.from("fetch_logs").select("*").order("executed_at", { ascending: false }).limit(30),
    admin.from("stock_prices").select("ticker, price, fetched_at, stocks(name, sector)").order("fetched_at", { ascending: true }).limit(500),
    admin.from("price_anomalies").select("*").order("detected_at", { ascending: false }).limit(50),
  ]);

  const typedLogs = (logs ?? []) as FetchLog[];
  const typedPrices = (prices ?? []) as unknown as PriceRow[];
  const typedAnomalies = ((anomalies ?? []) as PriceAnomaly[]).sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "open" ? -1 : 1;
  });
  const openAnomalyCount = typedAnomalies.filter((row) => row.status === "open").length;
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
          Price freshness, anomaly review, cron logs, and settlement-close visibility.
        </p>
      </div>

      <section className="card rounded-xl p-4 overflow-x-auto">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Price Anomaly Review</h2>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>
              Provider changes flagged or adjusted during ingestion. Raw prices and history remain untouched.
            </p>
          </div>
          <span
            className="text-[10px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap"
            style={{
              color: openAnomalyCount > 0 ? "var(--accent)" : "var(--up)",
              background: openAnomalyCount > 0 ? "var(--accent-dim)" : "var(--up-dim)",
            }}
          >
            {openAnomalyCount} open
          </span>
        </div>

        {typedAnomalies.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-3)" }}>No price anomalies recorded.</p>
        ) : (
          <table className="w-full min-w-[900px] text-xs">
            <thead style={{ color: "var(--text-3)" }}>
              <tr>
                <th className="text-left py-2">Status</th>
                <th className="text-left">Ticker</th>
                <th className="text-left">Market date</th>
                <th className="text-right">Price</th>
                <th className="text-right">Provider</th>
                <th className="text-right">Displayed</th>
                <th className="text-left pl-4">Reason</th>
                <th className="text-left">Detected</th>
                <th className="text-left pl-3">Adjustment</th>
              </tr>
            </thead>
            <tbody>
              {typedAnomalies.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="py-2.5">
                    <span style={{ color: row.status === "open" ? "var(--accent)" : "var(--text-3)" }}>
                      {row.status}
                    </span>
                  </td>
                  <td className="font-semibold" style={{ color: "var(--text)" }}>{row.ticker}</td>
                  <td style={{ color: "var(--text-2)" }}>{row.market_date}</td>
                  <td className="text-right tabular-nums" style={{ color: "var(--text-2)" }}>
                    ${Number(row.price).toFixed(2)}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: "var(--down)" }}>
                    {fmtPct(row.provider_change_pct)}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: row.applied_change_pct == null ? "var(--text-3)" : "var(--text)" }}>
                    {fmtPct(row.applied_change_pct)}
                  </td>
                  <td className="pl-4" style={{ color: "var(--text-2)" }} title={row.details ?? undefined}>
                    {anomalyReasonLabel(row.reason)}
                  </td>
                  <td style={{ color: "var(--text-3)" }}>{fmtTime(row.detected_at)}</td>
                  <td className="pl-3">
                    {row.status === "open" && (
                      <div className="flex items-center gap-2">
                        <form action={applyPriceAnomalyAdjustment} className="flex items-center gap-1.5">
                          <input type="hidden" name="anomalyId" value={row.id} />
                          <input
                            type="number"
                            name="adjustedPct"
                            min="-100"
                            max="100"
                            step="0.01"
                            defaultValue={row.applied_change_pct ?? undefined}
                            placeholder="Adjusted %"
                            required
                            className="w-24 rounded-md px-2 py-1.5 text-[10px]"
                            style={{ color: "var(--text)", background: "var(--surface-2)", border: "1px solid var(--border)" }}
                          />
                          <button
                            type="submit"
                            className="text-[10px] font-semibold rounded-md px-2.5 py-1.5"
                            style={{ color: "var(--accent)", border: "1px solid var(--border)" }}
                          >
                            Apply
                          </button>
                        </form>
                        <form action={markPriceAnomalyReviewed}>
                          <input type="hidden" name="anomalyId" value={row.id} />
                          <button
                            type="submit"
                            className="text-[10px] whitespace-nowrap"
                            style={{ color: "var(--text-3)" }}
                          >
                            Mark reviewed
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
