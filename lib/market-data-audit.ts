export const MARKET_DATA_AUDIT_JOB = "market_data_audit";
export const PERSISTENT_AUDIT_FAILURE_THRESHOLD = 2;

export type MarketDataAuditLog = {
  id: number;
  job_name: string;
  status: string;
  records_fetched: number | null;
  records_failed: number | null;
  failed_tickers: string[] | null;
  error_message: string | null;
  executed_at: string;
};

export type MarketDataAuditDetails = {
  auditStatus: "PASS" | "CRITICAL" | "INCOMPLETE";
  critical: number;
  warnings: number;
  providerErrors: string[];
  findings: Array<{
    severity: string;
    code: string;
    ticker: string;
    message: string;
  }>;
  priceReferenceCoverage: number;
  marketCapReferenceCoverage: number;
};

export type MarketDataAuditHealth = {
  state: "unknown" | "healthy" | "failing" | "persistent";
  consecutiveFailures: number;
  latest: MarketDataAuditLog | null;
};

function asFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseFindings(value: unknown): MarketDataAuditDetails["findings"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const finding = item as Record<string, unknown>;
    if (
      typeof finding.severity !== "string" ||
      typeof finding.code !== "string" ||
      typeof finding.ticker !== "string" ||
      typeof finding.message !== "string"
    ) {
      return [];
    }
    return [
      {
        severity: finding.severity,
        code: finding.code,
        ticker: finding.ticker,
        message: finding.message,
      },
    ];
  });
}

export function parseMarketDataAuditDetails(
  value: string | null | undefined,
): MarketDataAuditDetails | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const summary = parsed.summary;
    if (!summary || typeof summary !== "object") return null;
    const summaryRecord = summary as Record<string, unknown>;
    const auditStatus = parsed.audit_status;
    if (
      auditStatus !== "PASS" &&
      auditStatus !== "CRITICAL" &&
      auditStatus !== "INCOMPLETE"
    ) {
      return null;
    }

    return {
      auditStatus,
      critical: asFiniteNumber(summaryRecord.critical),
      warnings: asFiniteNumber(summaryRecord.warnings),
      providerErrors: Array.isArray(parsed.provider_errors)
        ? parsed.provider_errors.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      findings: parseFindings(parsed.findings),
      priceReferenceCoverage: asFiniteNumber(
        summaryRecord.price_reference_coverage,
      ),
      marketCapReferenceCoverage: asFiniteNumber(
        summaryRecord.market_cap_reference_coverage,
      ),
    };
  } catch {
    return null;
  }
}

export function getMarketDataAuditHealth(
  logs: MarketDataAuditLog[],
): MarketDataAuditHealth {
  const ordered = logs
    .filter((log) => log.job_name === MARKET_DATA_AUDIT_JOB)
    .slice()
    .sort(
      (left, right) =>
        new Date(right.executed_at).getTime() -
        new Date(left.executed_at).getTime(),
    );
  const latest = ordered[0] ?? null;
  if (!latest) {
    return { state: "unknown", consecutiveFailures: 0, latest: null };
  }
  if (latest.status === "success") {
    return { state: "healthy", consecutiveFailures: 0, latest };
  }

  let consecutiveFailures = 0;
  for (const log of ordered) {
    if (log.status === "success") break;
    consecutiveFailures += 1;
  }

  return {
    state:
      consecutiveFailures >= PERSISTENT_AUDIT_FAILURE_THRESHOLD
        ? "persistent"
        : "failing",
    consecutiveFailures,
    latest,
  };
}
