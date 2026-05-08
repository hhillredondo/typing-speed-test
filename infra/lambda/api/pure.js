// Pure helpers split out so they can be unit-tested without loading
// AWS SDK clients (which would require those packages on the test path).

function resolveBedrockModelId() {
  if (process.env.BEDROCK_MODEL_ID) return process.env.BEDROCK_MODEL_ID;
  const region = process.env.AWS_REGION || "";
  if (region.startsWith("eu-")) return "eu.amazon.nova-micro-v1:0";
  if (region.startsWith("us-")) return "us.amazon.nova-micro-v1:0";
  if (region.startsWith("ap-")) return "apac.amazon.nova-micro-v1:0";
  return "us.amazon.nova-micro-v1:0";
}

function isNotableSession(profile, score) {
  if (profile.totalTests % 5 === 0) return true;
  const previous = profile.recentWpm.slice(0, -1);
  if (previous.length > 0 && score > Math.max(...previous)) return true;
  const lastCoaching = profile.lastCoachingAt ? new Date(profile.lastCoachingAt).getTime() : 0;
  if (Date.now() - lastCoaching > 7 * 24 * 60 * 60 * 1000) return true;
  return false;
}

function computeWeakestKeys(rollingKeyStats) {
  return Object.entries(rollingKeyStats)
    .filter(([, v]) => v.correct + v.errors >= 5)
    .map(([key, v]) => ({
      key,
      errorRate: v.errors / (v.correct + v.errors),
      avgLatencyMs: v.count > 0 ? Math.round(v.totalLatencyMs / v.count) : 0,
    }))
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 5);
}

function computeSlowestBigrams(rollingBigramStats) {
  return Object.entries(rollingBigramStats)
    .filter(([, v]) => v.count >= 4)
    .map(([bigram, v]) => ({
      bigram,
      avgLatencyMs: Math.round(v.totalLatencyMs / v.count),
      count: v.count,
    }))
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, 5);
}

function classifyFatigueArchetype(windows) {
  if (!windows || windows.length < 3) return "unknown";
  const wpms = windows.map((w) => w.wpm);
  const peak = Math.max(...wpms);
  if (peak === 0) return "unknown";

  const firstHalf = wpms.slice(0, Math.ceil(wpms.length / 2));
  const secondHalf = wpms.slice(Math.ceil(wpms.length / 2));
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const lastWpm = wpms[wpms.length - 1];

  if (lastWpm < peak * 0.8) return "cliff-dropper";
  if (avgFirst > avgSecond * 1.15) return "fast-starter";
  if (avgSecond > avgFirst * 1.1) return "slow-warmer";
  return "consistent";
}

function computeWpmTrend(recentWpm) {
  if (recentWpm.length < 3) return 0;
  const n = recentWpm.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += recentWpm[i];
    sumXY += i * recentWpm[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return Math.round(slope * 100) / 100;
}

function determineTrigger(profile) {
  const previous = profile.recentWpm.slice(0, -1);
  const latest = profile.recentWpm[profile.recentWpm.length - 1];
  if (previous.length > 0 && latest > Math.max(...previous)) return "new_pb";
  if (profile.totalTests % 5 === 0) return "milestone";
  return "periodic";
}

module.exports = {
  resolveBedrockModelId,
  isNotableSession,
  computeWeakestKeys,
  computeSlowestBigrams,
  classifyFatigueArchetype,
  computeWpmTrend,
  determineTrigger,
};
