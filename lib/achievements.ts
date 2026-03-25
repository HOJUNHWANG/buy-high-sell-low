export type AchievementTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface Badge {
  key: string;
  label: string;
  icon: string;
  desc: string;
  tier: AchievementTier;
  reward: number;
}

export const TIER_META: Record<AchievementTier, { label: string; color: string; bg: string }> = {
  bronze:   { label: "Bronze",   color: "#CD7F32", bg: "rgba(205,127,50,0.12)" },
  silver:   { label: "Silver",   color: "#C0C0C0", bg: "rgba(192,192,192,0.12)" },
  gold:     { label: "Gold",     color: "#FFD700", bg: "rgba(255,215,0,0.12)" },
  platinum: { label: "Platinum", color: "#E5E4E2", bg: "rgba(229,228,226,0.15)" },
  diamond:  { label: "Diamond",  color: "#B9F2FF", bg: "rgba(185,242,255,0.15)" },
};

export const BADGES: Record<string, Badge> = {
  // ── Bronze ($50) — naturally achievable through daily trading ──
  first_trade:       { key: "first_trade",       label: "First Trade",       icon: "🎯", desc: "Made your first trade",              tier: "bronze", reward: 50 },
  penny_pincher:     { key: "penny_pincher",      label: "Penny Pincher",     icon: "🫰", desc: "Made a trade under $10",             tier: "bronze", reward: 50 },
  crypto_degen:      { key: "crypto_degen",        label: "Crypto Degen",      icon: "🪙", desc: "Bought a cryptocurrency",            tier: "bronze", reward: 50 },
  paper_hands:       { key: "paper_hands",         label: "Paper Hands",       icon: "🧻", desc: "Sold within 24 hours of buying",     tier: "bronze", reward: 50 },
  streak_7:          { key: "streak_7",            label: "Dedicated",         icon: "📅", desc: "7-day login streak",                 tier: "bronze", reward: 50 },
  diversified:       { key: "diversified",         label: "Diversified",       icon: "🌈", desc: "Hold 5+ different stocks",           tier: "bronze", reward: 50 },
  challenge_done:    { key: "challenge_done",      label: "Mission Complete",  icon: "🎯", desc: "Completed a weekly challenge",       tier: "bronze", reward: 50 },
  ten_trades:        { key: "ten_trades",          label: "Getting Started",   icon: "🔟", desc: "Execute 10 total trades",            tier: "bronze", reward: 50 },

  // ── Silver ($100) — requires effort and consistency ──
  diamond_hands:     { key: "diamond_hands",       label: "Diamond Hands",     icon: "💎", desc: "Held a position for 30+ days",       tier: "silver", reward: 100 },
  streak_30:         { key: "streak_30",           label: "Addicted",          icon: "🧠", desc: "30-day login streak",                tier: "silver", reward: 100 },
  full_send:         { key: "full_send",           label: "Full Send",         icon: "🚀", desc: "Put 90%+ of balance into one trade", tier: "silver", reward: 100 },
  buy_high_sell_low: { key: "buy_high_sell_low",   label: "Buy High Sell Low", icon: "📉", desc: "Realized a loss. Our namesake.",     tier: "silver", reward: 100 },
  whale:             { key: "whale",               label: "Whale",             icon: "🐋", desc: "Portfolio value over $5,000",        tier: "silver", reward: 100 },
  fifty_trades:      { key: "fifty_trades",        label: "Regular",           icon: "📊", desc: "Execute 50 total trades",            tier: "silver", reward: 100 },
  profit_master:     { key: "profit_master",       label: "Profit Master",     icon: "💰", desc: "5 profitable sells in a row",        tier: "silver", reward: 100 },
  crypto_collector:  { key: "crypto_collector",    label: "Crypto Collector",  icon: "🏦", desc: "Hold 3+ different cryptos at once",  tier: "silver", reward: 100 },
  short_seller:      { key: "short_seller",        label: "Short Seller",      icon: "🐻", desc: "Open your first short position",     tier: "silver", reward: 100 },

  // ── Gold ($200) — creative/unusual conditions ──
  broke:             { key: "broke",               label: "Broke",             icon: "💸", desc: "Portfolio value under $100",          tier: "gold", reward: 200 },
  liquidated:        { key: "liquidated",          label: "Liquidated",        icon: "💀", desc: "Got margin called. Ouch.",           tier: "gold", reward: 200 },
  phoenix:           { key: "phoenix",             label: "Phoenix",           icon: "🔥", desc: "Rose from the ashes after liquidation", tier: "gold", reward: 200 },
  double_up:         { key: "double_up",           label: "Double Up",         icon: "✌️", desc: "Portfolio reaches $2,000+",           tier: "gold", reward: 200 },
  day_trader:        { key: "day_trader",          label: "Day Trader",        icon: "⚡", desc: "Execute 5+ trades in a single day",  tier: "gold", reward: 200 },
  bargain_hunter:    { key: "bargain_hunter",      label: "Bargain Hunter",    icon: "🏷️", desc: "Buy a stock that's down 5%+ today",  tier: "gold", reward: 200 },
  fomo_buyer:        { key: "fomo_buyer",          label: "FOMO Buyer",        icon: "🤯", desc: "Buy a stock that's up 5%+ today",    tier: "gold", reward: 200 },
  bear_raid:         { key: "bear_raid",           label: "Bear Raid",         icon: "📉", desc: "Short 3+ stocks simultaneously",     tier: "gold", reward: 200 },
  contrarian:        { key: "contrarian",          label: "Contrarian",        icon: "🔄", desc: "Profit $200+ from a short cover",    tier: "gold", reward: 200 },

  // ── Platinum ($300) — serendipitous/unlikely ──
  cockroach:         { key: "cockroach",           label: "Cockroach",         icon: "🪳", desc: "Liquidated 3+ times and still trading", tier: "platinum", reward: 300 },
  triple_up:         { key: "triple_up",           label: "Triple Up",         icon: "🏆", desc: "Portfolio reaches $3,000+",          tier: "platinum", reward: 300 },
  flash_profit:      { key: "flash_profit",        label: "Flash Profit",      icon: "⚡", desc: "Single sell with $500+ realized profit", tier: "platinum", reward: 300 },
  hundred_trades:    { key: "hundred_trades",      label: "Centurion",         icon: "💯", desc: "Execute 100 total trades",           tier: "platinum", reward: 300 },
  hodl_master:       { key: "hodl_master",         label: "HODL Master",       icon: "🗿", desc: "Hold one position for 90+ days",     tier: "platinum", reward: 300 },
  short_squeeze:     { key: "short_squeeze",       label: "Short Squeezed",    icon: "🫠", desc: "Lose $500+ covering a short",        tier: "platinum", reward: 300 },

  // ── Diamond ($1,000) — extremely rare ──
  ten_x:             { key: "ten_x",              label: "10X Return",        icon: "👑", desc: "Portfolio reaches $10,000+",          tier: "diamond", reward: 1000 },
  perfect_month:     { key: "perfect_month",      label: "Perfect Month",     icon: "🌟", desc: "Complete 4 weekly challenges in a row", tier: "diamond", reward: 1000 },
  market_wizard:     { key: "market_wizard",      label: "Market Wizard",     icon: "🧙", desc: "10 profitable sells in a row",        tier: "diamond", reward: 1000 },
  zero_to_hero:      { key: "zero_to_hero",       label: "Zero to Hero",      icon: "🦸", desc: "Go from under $100 to over $5,000",   tier: "diamond", reward: 1000 },
  ultimate_hodl:     { key: "ultimate_hodl",      label: "Ultimate HODL",     icon: "🏔️", desc: "Hold 5+ positions each for 60+ days", tier: "diamond", reward: 1000 },
  bear_king:         { key: "bear_king",          label: "Bear King",         icon: "🐻‍❄️", desc: "Profit $1,000+ total from short selling", tier: "diamond", reward: 1000 },
} as const;

export type BadgeKey = keyof typeof BADGES;
export const ALL_BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];

export const TIERS_ORDERED: AchievementTier[] = ["bronze", "silver", "gold", "platinum", "diamond"];

export function getBadgesByTier(tier: AchievementTier): Badge[] {
  return ALL_BADGE_KEYS.filter((k) => BADGES[k].tier === tier).map((k) => BADGES[k]);
}
