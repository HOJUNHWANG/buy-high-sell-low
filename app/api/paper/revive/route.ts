import { NextResponse } from "next/server";

/**
 * Revive endpoint — DEPRECATED.
 * Liquidation now results in immediate suspension until next month.
 * No mid-month revival allowed.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Revive is no longer available. Trading resumes next month." },
    { status: 410 },
  );
}
