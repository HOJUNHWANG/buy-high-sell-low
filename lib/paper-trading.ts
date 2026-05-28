export const PAPER_POSITION_DUST_SHARES = 0.000001;
export const PAPER_POSITION_DUST_VALUE_USD = 0.01;

export function isDustPosition(shares: number, price: number): boolean {
  if (!Number.isFinite(shares) || shares <= PAPER_POSITION_DUST_SHARES) {
    return true;
  }
  if (Number.isFinite(price) && price > 0) {
    return shares * price < PAPER_POSITION_DUST_VALUE_USD;
  }
  return false;
}
