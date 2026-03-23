import { BADGES, TIER_META, type BadgeKey, type AchievementTier } from "@/lib/achievements";

interface Props {
  badgeKey: string;
  earned: boolean;
  earnedAt?: string;
}

export function AchievementBadge({ badgeKey, earned, earnedAt }: Props) {
  const badge = BADGES[badgeKey as BadgeKey];
  if (!badge) return null;

  const tier = TIER_META[badge.tier];

  return (
    <div
      className="rounded-lg p-3 text-center transition-all relative overflow-hidden"
      style={{
        background: earned ? tier.bg : "var(--surface)",
        border: `1px solid ${earned ? tier.color : "var(--border)"}`,
        borderWidth: earned ? "1.5px" : "1px",
      }}
      title={earned && earnedAt ? `Earned ${new Date(earnedAt).toLocaleDateString()}` : undefined}
    >
      {earned ? (
        <>
          <div className="text-2xl mb-1">{badge.icon}</div>
          <p className="text-[10px] font-semibold" style={{ color: "var(--text)" }}>
            {badge.label}
          </p>
          <p className="text-[9px] mt-0.5" style={{ color: "var(--text-3)" }}>
            {badge.desc}
          </p>
          <p className="text-[9px] font-bold mt-1" style={{ color: tier.color }}>
            +${badge.reward}
          </p>
        </>
      ) : (
        <>
          <div className="text-2xl mb-1" style={{ filter: "blur(4px) grayscale(1)", userSelect: "none" }}>
            {badge.icon}
          </div>
          <p className="text-[10px] font-semibold" style={{ color: "var(--text-4)" }}>
            ???
          </p>
          <p className="text-[9px] mt-0.5" style={{ color: "var(--text-4)", filter: "blur(3px)", userSelect: "none" }}>
            {badge.desc}
          </p>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg width="16" height="16" fill="none" stroke="var(--text-4)" strokeWidth="1.5" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="text-[9px] font-bold mt-1" style={{ color: "var(--text-4)" }}>
            ${badge.reward}
          </p>
        </>
      )}
    </div>
  );
}

/* Section header for tier grouping */
export function TierHeader({ tier }: { tier: AchievementTier }) {
  const meta = TIER_META[tier];
  return (
    <div className="flex items-center gap-2 mt-4 mb-2">
      <div className="w-3 h-3 rounded-full" style={{ background: meta.color }} />
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>
        {meta.label}
      </p>
      <div className="flex-1 h-px" style={{ background: meta.color, opacity: 0.2 }} />
    </div>
  );
}
