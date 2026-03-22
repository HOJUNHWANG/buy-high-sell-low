export const BADGES = {
  first_trade:       { key: "first_trade",       label: "First Trade",       icon: "\uD83C\uDFAF", desc: "Made your first trade" },
  diamond_hands:     { key: "diamond_hands",      label: "Diamond Hands",     icon: "\uD83D\uDC8E", desc: "Held a position for 30+ days" },
  paper_hands:       { key: "paper_hands",        label: "Paper Hands",       icon: "\uD83E\uDDFB", desc: "Sold within 24 hours of buying" },
  buy_high_sell_low: { key: "buy_high_sell_low",  label: "Buy High Sell Low", icon: "\uD83D\uDCC9", desc: "Realized a loss. Our namesake." },
  diversified:       { key: "diversified",        label: "Diversified",       icon: "\uD83C\uDF08", desc: "Hold 5+ different stocks" },
  whale:             { key: "whale",              label: "Whale",             icon: "\uD83D\uDC0B", desc: "Portfolio value over $5,000" },
  broke:             { key: "broke",              label: "Broke",             icon: "\uD83D\uDCB8", desc: "Portfolio value under $100" },
  crypto_degen:      { key: "crypto_degen",       label: "Crypto Degen",      icon: "\uD83E\uDE99", desc: "Bought a cryptocurrency" },
  full_send:         { key: "full_send",          label: "Full Send",         icon: "\uD83D\uDE80", desc: "Put 90%+ of balance into one trade" },
  penny_pincher:     { key: "penny_pincher",      label: "Penny Pincher",     icon: "\uD83E\uDEF0", desc: "Made a trade under $10" },
  liquidated:        { key: "liquidated",         label: "Liquidated",        icon: "\uD83D\uDC80", desc: "Got margin called. Ouch." },
  phoenix:           { key: "phoenix",            label: "Phoenix",           icon: "\uD83D\uDD25", desc: "Rose from the ashes after liquidation" },
  cockroach:         { key: "cockroach",          label: "Cockroach",         icon: "\uD83E\uDEB3", desc: "Liquidated 3+ times and still trading" },
  streak_7:          { key: "streak_7",           label: "Dedicated",         icon: "\uD83D\uDCC5", desc: "7-day login streak" },
  streak_30:         { key: "streak_30",          label: "Addicted",          icon: "\uD83E\uDDE0", desc: "30-day login streak" },
  challenge_done:    { key: "challenge_done",     label: "Mission Complete",  icon: "\uD83C\uDFAF", desc: "Completed a weekly challenge" },
} as const;

export type BadgeKey = keyof typeof BADGES;
export const ALL_BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];
