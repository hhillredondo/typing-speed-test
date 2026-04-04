import englishWords from "../../assets/words/en.json";
import type { AnalyticsProfile } from "../../types/analytics";
import { shuffleArray } from "../Test/utils";

export function generateDrillWords(profile: AnalyticsProfile): string[] {
  const weakKeys = new Set(
    (profile.weakestKeys || []).map((k) => k.key.toLowerCase())
  );
  const weakBigrams = new Set(
    (profile.slowestBigrams || []).map((b) => b.bigram.toLowerCase())
  );

  if (weakKeys.size === 0 && weakBigrams.size === 0) {
    return shuffleArray([...englishWords]);
  }

  const scored = englishWords.map((word) => {
    const lower = word.toLowerCase();
    let score = 0;

    for (const ch of lower) {
      if (weakKeys.has(ch)) score += 2;
    }

    for (let i = 0; i < lower.length - 1; i++) {
      const pair = lower[i] + lower[i + 1];
      if (weakBigrams.has(pair)) score += 3;
    }

    return { word, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const relevant = scored.filter((s) => s.score > 0).map((s) => s.word);
  const filler = scored.filter((s) => s.score === 0).map((s) => s.word);

  const target = 200;
  const result: string[] = [];

  while (result.length < target && relevant.length > 0) {
    result.push(...shuffleArray([...relevant]).slice(0, target - result.length));
  }
  if (result.length < target) {
    result.push(...shuffleArray([...filler]).slice(0, target - result.length));
  }

  return shuffleArray(result);
}
