import { generateDrillWords } from "./generateDrillWords";
import type { AnalyticsProfile } from "../../types/analytics";

const baseProfile = (overrides: Partial<AnalyticsProfile> = {}): AnalyticsProfile => ({
  totalTests: 1,
  rollingKeyStats: {},
  rollingBigramStats: {},
  rollingBackspaceStats: {
    totalBackspaces: 0,
    wordsWithBackspace: 0,
    wordsRecovered: 0,
    wordsFailed: 0,
    totalConsecutiveRuns: 0,
    totalConsecutiveLength: 0,
  },
  fatigueArchetype: "consistent",
  weakestKeys: [],
  slowestBigrams: [],
  recentWpm: [],
  recentAccuracy: [],
  wpmTrend: 0,
  avgWindows: [],
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("generateDrillWords", () => {
  test("falls back to a shuffled dictionary when no weaknesses are known", () => {
    const out = generateDrillWords(baseProfile());
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
    // every result is a string
    expect(out.every((w) => typeof w === "string")).toBe(true);
  });

  test("biases toward words containing weak keys", () => {
    // "k" is in the dictionary (make, take, like, look, work, …) but isn't
    // ubiquitous, so a meaningful bias is observable.
    const profile = baseProfile({
      weakestKeys: [{ key: "k", errorRate: 0.5, avgLatencyMs: 200 }],
    });
    const out = generateDrillWords(profile);
    const withK = out.filter((w) => w.toLowerCase().includes("k")).length;
    expect(withK).toBeGreaterThan(0);
    // The function fills with weak-key words first; they should dominate.
    expect(withK / out.length).toBeGreaterThan(0.5);
  });

  test("returns ~200 words", () => {
    const profile = baseProfile({
      weakestKeys: [{ key: "e", errorRate: 0.2, avgLatencyMs: 150 }],
    });
    const out = generateDrillWords(profile);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(200);
  });
});
