import { describe, expect, it } from "vitest";
import {
  getMarketDataAuditHealth,
  MARKET_DATA_AUDIT_JOB,
  parseMarketDataAuditDetails,
  parseMarketDataRemediationDetails,
  type MarketDataAuditLog,
} from "@/lib/market-data-audit";

function auditLog(
  id: number,
  status: string,
  executedAt: string,
  ticker = "MU",
  field = "market_cap",
  code = "market_cap_deviation",
): MarketDataAuditLog {
  return {
    id,
    job_name: MARKET_DATA_AUDIT_JOB,
    status,
    records_fetched: 133,
    records_failed: status === "success" ? 0 : 1,
    failed_tickers: status === "success" ? null : [ticker],
    error_message:
      status === "success"
        ? null
        : JSON.stringify({
            audit_status: status === "incomplete" ? "INCOMPLETE" : "CRITICAL",
            summary: {},
            provider_errors: [],
            findings: [
              {
                severity: "critical",
                ticker,
                field,
                code,
                message: "test finding",
              },
            ],
          }),
    executed_at: executedAt,
  };
}

describe("market data audit health", () => {
  it("marks the same finding twice as persistent regardless of input order", () => {
    const health = getMarketDataAuditHealth([
      auditLog(1, "success", "2026-08-01T00:00:00Z"),
      auditLog(3, "critical", "2026-08-03T00:00:00Z"),
      auditLog(2, "incomplete", "2026-08-02T00:00:00Z"),
    ]);

    expect(health.state).toBe("persistent");
    expect(health.consecutiveFailures).toBe(2);
    expect(health.repeatedFingerprints).toEqual([
      "MU|market_cap|market_cap_deviation",
    ]);
    expect(health.latest?.id).toBe(3);
  });

  it("does not combine unrelated audit failures into one persistent streak", () => {
    const health = getMarketDataAuditHealth([
      auditLog(
        3,
        "critical",
        "2026-08-03T00:00:00Z",
        "GLD",
        "price",
        "price_deviation",
      ),
      auditLog(2, "critical", "2026-08-02T00:00:00Z"),
      auditLog(1, "success", "2026-08-01T00:00:00Z"),
    ]);

    expect(health.state).toBe("failing");
    expect(health.consecutiveFailures).toBe(1);
    expect(health.repeatedFingerprints).toEqual([]);
  });

  it("marks a repeated provider failure as persistent without remediation", () => {
    const providerFailure = (
      id: number,
      executedAt: string,
    ): MarketDataAuditLog => ({
      ...auditLog(id, "incomplete", executedAt),
      failed_tickers: null,
      error_message: JSON.stringify({
        audit_status: "INCOMPLETE",
        summary: {},
        provider_errors: ["Nasdaq unavailable"],
        findings: [],
      }),
    });
    const health = getMarketDataAuditHealth([
      providerFailure(2, "2026-08-02T00:00:00Z"),
      providerFailure(1, "2026-08-01T00:00:00Z"),
    ]);

    expect(health.state).toBe("persistent");
    expect(health.consecutiveFailures).toBe(2);
    expect(health.repeatedFingerprints).toEqual([
      "provider|nasdaq unavailable",
    ]);
  });

  it("resets the failure streak on the next successful audit", () => {
    const health = getMarketDataAuditHealth([
      auditLog(2, "success", "2026-08-02T00:00:00Z"),
      auditLog(1, "critical", "2026-08-01T00:00:00Z"),
    ]);

    expect(health.state).toBe("healthy");
    expect(health.consecutiveFailures).toBe(0);
  });

  it("reports a single failure as not yet persistent", () => {
    const health = getMarketDataAuditHealth([
      auditLog(2, "incomplete", "2026-08-02T00:00:00Z"),
      auditLog(1, "success", "2026-08-01T00:00:00Z"),
    ]);

    expect(health.state).toBe("failing");
    expect(health.consecutiveFailures).toBe(1);
  });
});

describe("market data audit details", () => {
  it("parses the compact audit log payload", () => {
    const details = parseMarketDataAuditDetails(
      JSON.stringify({
        audit_status: "CRITICAL",
        summary: {
          critical: 2,
          warnings: 1,
          price_reference_coverage: 133,
          market_cap_reference_coverage: 132,
        },
        provider_errors: ["CoinGecko unavailable"],
        findings: [
          {
            severity: "critical",
            code: "market_cap_deviation",
            ticker: "MU",
            field: "market_cap",
            message: "Stored market cap differs from reference",
          },
        ],
      }),
    );

    expect(details).toEqual({
      auditStatus: "CRITICAL",
      critical: 2,
      warnings: 1,
      providerErrors: ["CoinGecko unavailable"],
      findings: [
        {
          severity: "critical",
          code: "market_cap_deviation",
          ticker: "MU",
          field: "market_cap",
          message: "Stored market cap differs from reference",
        },
      ],
      priceReferenceCoverage: 133,
      marketCapReferenceCoverage: 132,
    });
  });

  it("rejects malformed or unrelated log details", () => {
    expect(parseMarketDataAuditDetails("not-json")).toBeNull();
    expect(parseMarketDataAuditDetails('{"status":"success"}')).toBeNull();
  });
});

describe("market data remediation details", () => {
  it("parses a finished targeted remediation result", () => {
    const details = parseMarketDataRemediationDetails(
      JSON.stringify({
        stage: "finished",
        trigger_audit_id: 42,
        targets: { price: ["BTC-USD"], market_cap: ["MU"] },
        result: {
          price_updated: 1,
          market_cap_updated: 1,
          errors: [],
        },
      }),
    );

    expect(details).toEqual({
      stage: "finished",
      triggerAuditId: 42,
      priceTargets: ["BTC-USD"],
      marketCapTargets: ["MU"],
      reason: null,
      priceUpdated: 1,
      marketCapUpdated: 1,
      errors: [],
    });
  });

  it("rejects malformed remediation details", () => {
    expect(parseMarketDataRemediationDetails("not-json")).toBeNull();
    expect(parseMarketDataRemediationDetails('{"stage":"unknown"}')).toBeNull();
  });
});
