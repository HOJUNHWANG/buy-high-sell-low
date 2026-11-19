-- Remove near-zero paper positions left by rounded "sell all" / "cover all" requests.
DELETE FROM paper_positions
WHERE shares <= 0.000001
   OR shares * avg_cost < 0.01;
