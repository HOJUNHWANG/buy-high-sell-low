export const MARKET_DATA_AUDIT_JOB = "market_data_audit";
export const MARKET_DATA_REMEDIATION_JOB = "market_data_remediation";
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
    field: string;
    message: string;
  }>;
  priceReferenceCoverage: number;
  marketCapReferenceCoverage: number;
};

export type MarketDataAuditHealth = {
  state: "unknown" | "healthy" | "failing" | "persistent";
  consecutiveFailures: number;
  repeatedFingerprints: string[];
  latest: MarketDataAuditLog | null;
};

export type MarketDataRemediationDetails = {
  stage: "started" | "finished" | "skipped";
  triggerAuditId: number | null;
  priceTargets: string[];
  marketCapTargets: string[];
  reason: string | null;
  priceUpdated: number;
  marketCapUpdated: number;
  errors: string[];
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
      typeof finding.field !== "string" ||
      typeof finding.message !== "string"
    ) {
      return [];
    }
    return [
      {
        severity: finding.severity,
        code: finding.code,
        ticker: finding.ticker,
        field: finding.field,
        message: finding.message,
      },
    ];
  });
}

function normalizeProviderError(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function auditFailureFingerprints(log: MarketDataAuditLog): Set<string> {
  if (log.status === "success") return new Set();

  const details = parseMarketDataAuditDetails(log.error_message);
  const criticalFindings = (details?.findings ?? [])
    .filter((finding) => finding.severity === "critical")
    .map(
      (finding) =>
        `${finding.ticker.trim().toUpperCase()}|${finding.field
          .trim()
          .toLowerCase()}|${finding.code.trim().toLowerCase()}`,
    )
    .filter((fingerprint) => !fingerprint.includes("||"));

  if (criticalFindings.length > 0) return new Set(criticalFindings);

  // Provider/incomplete audits have no safe row to auto-repair, but the same
  // operational failure should still become visible as persistent in Data Health.
  const providerErrors = (details?.providerErrors ?? [])
    .map(normalizeProviderError)
    .filter(Boolean)
    .map((error) => `provider|${error}`);
  if (providerErrors.length > 0) return new Set(providerErrors);

  const affected = (log.failed_tickers ?? [])
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean)
    .map((ticker) => `${ticker}|audit|${log.status.toLowerCase()}`);
  if (affected.length > 0) return new Set(affected);

  return new Set([`audit|${log.status.toLowerCase()}`]);
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function parseMarketDataRemediationDetails(
  value: string | null | undefined,
): MarketDataRemediationDetails | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const stage = parsed.stage;
    if (stage !== "started" && stage !== "finished" && stage !== "skipped") {
      return null;
    }
    const targets =
      parsed.targets && typeof parsed.targets === "object"
        ? (parsed.targets as Record<string, unknown>)
        : {};
    const result =
      parsed.result && typeof parsed.result === "object"
        ? (parsed.result as Record<string, unknown>)
        : {};
    const triggerAuditId = parsed.trigger_audit_id;

    return {
      stage,
      triggerAuditId:
        typeof triggerAuditId === "number" && Number.isFinite(triggerAuditId)
          ? triggerAuditId
          : null,
      priceTargets: asStringArray(targets.price),
      marketCapTargets: asStringArray(targets.market_cap),
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
      priceUpdated: asFiniteNumber(result.price_updated),
      marketCapUpdated: asFiniteNumber(result.market_cap_updated),
      errors: asStringArray(result.errors),
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
    return {
      state: "unknown",
      consecutiveFailures: 0,
      repeatedFingerprints: [],
      latest: null,
    };
  }
  if (latest.status === "success") {
    return {
      state: "healthy",
      consecutiveFailures: 0,
      repeatedFingerprints: [],
      latest,
    };
  }

  const latestFingerprints = auditFailureFingerprints(latest);
  const streaks = new Map<string, number>();
  for (const fingerprint of latestFingerprints) {
    let streak = 0;
    for (const log of ordered) {
      if (!auditFailureFingerprints(log).has(fingerprint)) break;
      streak += 1;
    }
    streaks.set(fingerprint, streak);
  }
  const consecutiveFailures = Math.max(1, ...streaks.values());
  const repeatedFingerprints = [...streaks.entries()]
    .filter(([, streak]) => streak >= PERSISTENT_AUDIT_FAILURE_THRESHOLD)
    .map(([fingerprint]) => fingerprint)
    .sort();

  return {
    state: repeatedFingerprints.length > 0 ? "persistent" : "failing",
    consecutiveFailures,
    repeatedFingerprints,
    latest,
  };
}
