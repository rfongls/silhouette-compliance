export type ReadinessProfile = "Mature" | "Established" | "Developing" | "Foundational";

export type CapabilityReadinessSummary = {
  total: number;
  established: number;
  developing: number;
  needsAttention: number;
};

function numericScore(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
}

export function readinessProfile(score: unknown): ReadinessProfile {
  const value = numericScore(score);
  if (value >= 85) return "Mature";
  if (value >= 70) return "Established";
  if (value >= 50) return "Developing";
  return "Foundational";
}

export function capabilityReadinessSummary(bucketScores: unknown): CapabilityReadinessSummary {
  const buckets = bucketScores && typeof bucketScores === "object"
    ? Object.values(bucketScores as Record<string, { score?: unknown }>)
    : [];
  return buckets.reduce<CapabilityReadinessSummary>((summary, bucket) => {
    const score = numericScore(bucket?.score);
    summary.total += 1;
    if (score >= 70) summary.established += 1;
    else if (score >= 40) summary.developing += 1;
    else summary.needsAttention += 1;
    return summary;
  }, { total: 0, established: 0, developing: 0, needsAttention: 0 });
}

export function capabilityReadinessText(summary: CapabilityReadinessSummary) {
  if (!summary.total) return "Capability readiness will appear when scored capability data is available.";
  return `${summary.total} capabilities assessed: ${summary.established} established, ${summary.developing} developing, and ${summary.needsAttention} prioritized for improvement.`;
}

export const SCORING_METHODOLOGY = "This assessment measures documented evidence across incident response capabilities. Controls are weighted by priority and consolidated into fixed capability point budgets, so overlapping standards provide traceability without being counted multiple times. Use the capability profile, findings, and remediation roadmap to prioritize improvement. This is an evidence-based readiness assessment, not a legal compliance determination.";

export const NETWORK_SCORING_METHODOLOGY = "Each organization is assessed independently using documented evidence across incident response capabilities. Controls are weighted by priority and consolidated into fixed capability point budgets, so overlapping standards provide traceability without being counted multiple times. Network results summarize capability readiness and common remediation priorities across the participating organizations. This is an evidence-based readiness assessment, not a legal compliance determination.";
