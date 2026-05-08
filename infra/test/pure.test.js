const {
  resolveBedrockModelId,
  isNotableSession,
  computeWeakestKeys,
  computeSlowestBigrams,
  classifyFatigueArchetype,
  computeWpmTrend,
  determineTrigger,
} = require("../lambda/api/pure");

describe("resolveBedrockModelId", () => {
  const originalEnv = process.env;
  afterEach(() => { process.env = { ...originalEnv }; });

  test("respects BEDROCK_MODEL_ID override", () => {
    process.env = { ...originalEnv, BEDROCK_MODEL_ID: "custom-model" };
    expect(resolveBedrockModelId()).toBe("custom-model");
  });

  test("maps eu region to eu inference profile", () => {
    process.env = { ...originalEnv, BEDROCK_MODEL_ID: "", AWS_REGION: "eu-west-1" };
    expect(resolveBedrockModelId()).toBe("eu.amazon.nova-micro-v1:0");
  });

  test("maps us region to us inference profile", () => {
    process.env = { ...originalEnv, BEDROCK_MODEL_ID: "", AWS_REGION: "us-east-1" };
    expect(resolveBedrockModelId()).toBe("us.amazon.nova-micro-v1:0");
  });

  test("maps ap region to apac inference profile", () => {
    process.env = { ...originalEnv, BEDROCK_MODEL_ID: "", AWS_REGION: "ap-southeast-1" };
    expect(resolveBedrockModelId()).toBe("apac.amazon.nova-micro-v1:0");
  });

  test("falls back to us profile for unknown regions", () => {
    process.env = { ...originalEnv, BEDROCK_MODEL_ID: "", AWS_REGION: "ca-central-1" };
    expect(resolveBedrockModelId()).toBe("us.amazon.nova-micro-v1:0");
  });
});

describe("isNotableSession", () => {
  test("milestone every 5th test", () => {
    // total=5 hits the milestone branch; recent values don't matter
    expect(isNotableSession({ totalTests: 5, recentWpm: [50, 50, 50, 50, 40], lastCoachingAt: new Date().toISOString() }, 40)).toBe(true);
    // total=4: no milestone, score 40 < prior max 50 (no PB), recent coaching → not notable
    expect(isNotableSession({ totalTests: 4, recentWpm: [50, 50, 50, 40], lastCoachingAt: new Date().toISOString() }, 40)).toBe(false);
  });

  test("flags personal best (current score beats max of previous)", () => {
    const profile = { totalTests: 4, recentWpm: [40, 45, 50, 60], lastCoachingAt: new Date().toISOString() };
    expect(isNotableSession(profile, 60)).toBe(true);
  });

  test("does not flag matching-but-not-exceeding score as PB", () => {
    const profile = { totalTests: 4, recentWpm: [50, 50, 50, 50], lastCoachingAt: new Date().toISOString() };
    expect(isNotableSession(profile, 50)).toBe(false);
  });

  test("flags after >7 days since last coaching", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const profile = { totalTests: 3, recentWpm: [10, 10, 10], lastCoachingAt: eightDaysAgo };
    expect(isNotableSession(profile, 10)).toBe(true);
  });

  test("missing lastCoachingAt counts as 'long ago' (notable)", () => {
    const profile = { totalTests: 3, recentWpm: [10, 10, 10] };
    expect(isNotableSession(profile, 10)).toBe(true);
  });
});

describe("computeWeakestKeys", () => {
  test("filters keys with fewer than 5 attempts", () => {
    const stats = {
      a: { correct: 2, errors: 1, totalLatencyMs: 0, count: 0 },
      b: { correct: 4, errors: 1, totalLatencyMs: 0, count: 0 }, // exactly 5 — kept
      c: { correct: 3, errors: 0, totalLatencyMs: 0, count: 0 }, // 3 — dropped
    };
    const out = computeWeakestKeys(stats);
    const keys = out.map((k) => k.key);
    expect(keys).toContain("b");
    expect(keys).not.toContain("a");
    expect(keys).not.toContain("c");
  });

  test("sorts by error rate descending and caps at 5", () => {
    const stats = {};
    for (let i = 0; i < 8; i++) {
      stats[`k${i}`] = { correct: 10, errors: i, totalLatencyMs: 0, count: 0 };
    }
    const out = computeWeakestKeys(stats);
    expect(out).toHaveLength(5);
    expect(out[0].key).toBe("k7");
    expect(out[4].key).toBe("k3");
  });

  test("computes avgLatencyMs from totalLatencyMs / count", () => {
    const out = computeWeakestKeys({
      x: { correct: 5, errors: 0, totalLatencyMs: 1000, count: 10 },
    });
    expect(out[0].avgLatencyMs).toBe(100);
  });
});

describe("computeSlowestBigrams", () => {
  test("filters bigrams with count < 4", () => {
    const stats = {
      th: { totalLatencyMs: 400, count: 4 },
      he: { totalLatencyMs: 300, count: 3 },
    };
    const out = computeSlowestBigrams(stats);
    const bigrams = out.map((b) => b.bigram);
    expect(bigrams).toContain("th");
    expect(bigrams).not.toContain("he");
  });

  test("sorts by avgLatency descending and caps at 5", () => {
    const stats = {};
    for (let i = 0; i < 8; i++) {
      stats[`b${i}`] = { totalLatencyMs: i * 100, count: 4 };
    }
    const out = computeSlowestBigrams(stats);
    expect(out).toHaveLength(5);
    expect(out[0].bigram).toBe("b7");
  });
});

describe("classifyFatigueArchetype", () => {
  test("returns unknown for too few windows", () => {
    expect(classifyFatigueArchetype([])).toBe("unknown");
    expect(classifyFatigueArchetype([{ wpm: 50 }, { wpm: 50 }])).toBe("unknown");
  });

  test("returns unknown when all windows are zero", () => {
    expect(classifyFatigueArchetype([{ wpm: 0 }, { wpm: 0 }, { wpm: 0 }])).toBe("unknown");
  });

  test("cliff-dropper when last window < 80% of peak", () => {
    expect(classifyFatigueArchetype([{ wpm: 50 }, { wpm: 60 }, { wpm: 30 }])).toBe("cliff-dropper");
  });

  test("fast-starter when first half significantly faster than second", () => {
    expect(classifyFatigueArchetype([
      { wpm: 60 }, { wpm: 60 }, { wpm: 60 },
      { wpm: 50 }, { wpm: 50 }, { wpm: 50 },
    ])).toBe("fast-starter");
  });

  test("slow-warmer when second half faster than first", () => {
    expect(classifyFatigueArchetype([
      { wpm: 40 }, { wpm: 40 }, { wpm: 40 },
      { wpm: 50 }, { wpm: 50 }, { wpm: 50 },
    ])).toBe("slow-warmer");
  });

  test("consistent for stable wpm", () => {
    expect(classifyFatigueArchetype([
      { wpm: 50 }, { wpm: 50 }, { wpm: 50 }, { wpm: 50 },
    ])).toBe("consistent");
  });
});

describe("computeWpmTrend", () => {
  test("returns 0 for too few samples", () => {
    expect(computeWpmTrend([])).toBe(0);
    expect(computeWpmTrend([50, 60])).toBe(0);
  });

  test("positive slope for improving series", () => {
    expect(computeWpmTrend([40, 45, 50, 55, 60])).toBe(5);
  });

  test("negative slope for declining series", () => {
    expect(computeWpmTrend([60, 55, 50, 45, 40])).toBe(-5);
  });

  test("zero slope for flat series", () => {
    expect(computeWpmTrend([50, 50, 50, 50])).toBe(0);
  });

  test("rounds to two decimals", () => {
    const out = computeWpmTrend([50, 51, 51, 52, 53]);
    expect(Number.isFinite(out)).toBe(true);
    // Rounded to two decimals → no more than two digits after the dot.
    expect(out.toString()).toMatch(/^-?\d+(\.\d{1,2})?$/);
  });
});

describe("determineTrigger", () => {
  test("new_pb when latest beats prior max", () => {
    expect(determineTrigger({ totalTests: 4, recentWpm: [40, 45, 50, 60] })).toBe("new_pb");
  });

  test("milestone when totalTests divisible by 5 and not a PB", () => {
    expect(determineTrigger({ totalTests: 5, recentWpm: [60, 60, 60, 60, 50] })).toBe("milestone");
  });

  test("periodic otherwise", () => {
    expect(determineTrigger({ totalTests: 3, recentWpm: [60, 60, 50] })).toBe("periodic");
  });
});
