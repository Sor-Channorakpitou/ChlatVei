/**
 * Wilson score interval for a binomial proportion (95% by default).
 *
 * Used to rank "most confusing steps" (RQ3): with few responses, a raw rate like
 * 2/2 = 100% is misleading. Ranking by the interval's lower bound favors steps
 * that are confusing *and* have enough evidence.
 */
export function wilsonInterval(successes: number, total: number, z = 1.96): { rate: number; low: number; high: number } {
  if (total <= 0) return { rate: 0, low: 0, high: 0 };
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return { rate: round(p), low: round(Math.max(0, (centre - margin) / denom)), high: round(Math.min(1, (centre + margin) / denom)) };
}
