/**
 * US stock market hours check.
 * Stocks & ETFs: tradeable only during regular hours (9:30 AM – 4:00 PM ET, Mon–Fri).
 * Crypto (tickers ending in -USD): tradeable 24/7.
 */

export function isCrypto(ticker: string): boolean {
  return ticker.endsWith("-USD");
}

export function isMarketOpen(): boolean {
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay(); // 0=Sun, 6=Sat
  const mins = et.getHours() * 60 + et.getMinutes();

  const isWeekday = day >= 1 && day <= 5;
  return isWeekday && mins >= 570 && mins < 960; // 9:30–16:00
}

export function getMarketStatusMessage(): string {
  const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();

  if (day === 0 || day === 6) return "Market is closed (weekend). Opens Monday 9:30 AM ET.";
  if (mins < 570) {
    const left = 570 - mins;
    return `Market is closed. Opens in ${Math.floor(left / 60)}h ${left % 60}m.`;
  }
  if (mins >= 960) return "Market is closed. Opens tomorrow 9:30 AM ET.";
  return "Market is open.";
}
