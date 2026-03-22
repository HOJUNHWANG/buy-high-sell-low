import { BADGES, type BadgeKey } from "@/lib/achievements";

interface Props {
  badgeKey: string;
  earned: boolean;
  earnedAt?: string;
}

export function AchievementBadge({ badgeKey, earned, earnedAt }: Props) {
  const badge = BADGES[badgeKey as BadgeKey];
  if (!badge) return null;

  return (
    <div
      className="rounded-lg p-3 text-center transition-all"
      style={{
        background: earned ? "var(--surface-2)" : "var(--surface)",
        border: `1px solid ${earned ? "var(--accent-dim)" : "var(--border)"}`,
        opacity: earned ? 1 : 0.35,
      }}
      title={earned && earnedAt ? `Earned ${new Date(earnedAt).toLocaleDateString()}` : badge.desc}
    >
      <div className="text-2xl mb-1">{badge.icon}</div>
      <p className="text-[10px] font-semibold" style={{ color: earned ? "var(--text)" : "var(--text-3)" }}>
        {badge.label}
      </p>
      <p className="text-[9px] mt-0.5" style={{ color: "var(--text-3)" }}>
        {badge.desc}
      </p>
    </div>
  );
}
