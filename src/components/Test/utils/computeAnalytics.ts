import type {
  BackspaceEvent,
  BackspaceStats,
  KeystrokeEvent,
  WordEvent,
  TestAnalytics,
} from "../../../types/analytics";

const MAX_REASONABLE_LATENCY_MS = 5000;

function isValidLatency(latency: number): boolean {
  return latency > 0 && latency < MAX_REASONABLE_LATENCY_MS;
}

function sameWord(a: KeystrokeEvent, b: KeystrokeEvent): boolean {
  return a.wordIdx === b.wordIdx;
}

function computeKeyStats(
  keystrokes: KeystrokeEvent[]
): TestAnalytics["keyStats"] {
  const agg: Record<
    string,
    { correct: number; errors: number; totalLatencyMs: number; latencyCount: number }
  > = {};

  for (let i = 0; i < keystrokes.length; i++) {
    const evt = keystrokes[i];
    const k = evt.key.toLowerCase();
    if (!agg[k]) agg[k] = { correct: 0, errors: 0, totalLatencyMs: 0, latencyCount: 0 };

    if (evt.correct) agg[k].correct++;
    else agg[k].errors++;

    const hasPrev = i > 0 && sameWord(evt, keystrokes[i - 1]);
    const latency = hasPrev ? evt.ts - keystrokes[i - 1].ts : -1;
    if (isValidLatency(latency)) {
      agg[k].totalLatencyMs += latency;
      agg[k].latencyCount++;
    }
  }

  const result: TestAnalytics["keyStats"] = {};
  for (const [k, v] of Object.entries(agg)) {
    result[k] = {
      correct: v.correct,
      errors: v.errors,
      avgLatencyMs: v.latencyCount > 0 ? Math.round(v.totalLatencyMs / v.latencyCount) : 0,
    };
  }
  return result;
}

function computeBigramStats(
  keystrokes: KeystrokeEvent[]
): TestAnalytics["bigramStats"] {
  const agg: Record<string, { totalLatencyMs: number; count: number }> = {};

  for (let i = 1; i < keystrokes.length; i++) {
    if (keystrokes[i].wordIdx !== keystrokes[i - 1].wordIdx) continue;
    if (keystrokes[i].pos !== keystrokes[i - 1].pos + 1) continue;

    const prev = keystrokes[i - 1].expected || keystrokes[i - 1].key;
    const curr = keystrokes[i].expected || keystrokes[i].key;
    const bigram = (prev + curr).toLowerCase();
    const latency = keystrokes[i].ts - keystrokes[i - 1].ts;

    if (latency > 0 && latency < MAX_REASONABLE_LATENCY_MS) {
      if (!agg[bigram]) agg[bigram] = { totalLatencyMs: 0, count: 0 };
      agg[bigram].totalLatencyMs += latency;
      agg[bigram].count++;
    }
  }

  return Object.entries(agg)
    .filter(([, v]) => v.count >= 2)
    .map(([bigram, v]) => ({
      bigram,
      avgLatencyMs: Math.round(v.totalLatencyMs / v.count),
      count: v.count,
    }))
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, 20);
}

function computeWindows(
  keystrokes: KeystrokeEvent[],
  wordEvents: WordEvent[],
  testDurationSec: number
): TestAnalytics["windows"] {
  const windowDuration = 10;
  const windowCount = Math.ceil(testDurationSec / windowDuration);
  const windows: TestAnalytics["windows"] = [];

  for (let w = 0; w < windowCount; w++) {
    const startMs = w * windowDuration * 1000;
    const endMs = (w + 1) * windowDuration * 1000;

    const wKeys = keystrokes.filter((k) => k.ts >= startMs && k.ts < endMs);
    const wCorrectWords = wordEvents.filter(
      (we) => we.ts >= startMs && we.ts < endMs && we.correct
    ).length;

    const correct = wKeys.filter((k) => k.correct).length;
    const total = wKeys.length;

    windows.push({
      startSec: w * windowDuration,
      wpm: wCorrectWords * (60 / windowDuration),
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 100,
      keystrokes: total,
    });
  }

  return windows;
}

function computeBackspaceStats(
  backspaceEvents: BackspaceEvent[],
  wordEvents: WordEvent[],
  consecutiveRuns: number[]
): BackspaceStats {
  const wordsWithBs = new Set(backspaceEvents.map((e) => e.wordIdx));

  let wordsRecovered = 0;
  let wordsFailed = 0;
  for (const we of wordEvents) {
    if (!wordsWithBs.has(we.wordIdx)) continue;
    if (we.correct) wordsRecovered++;
    else wordsFailed++;
  }

  const totalConsecutiveLength = consecutiveRuns.reduce((a, b) => a + b, 0);
  const maxConsecutiveLength = consecutiveRuns.length > 0 ? Math.max(...consecutiveRuns) : 0;

  return {
    totalBackspaces: backspaceEvents.length,
    wordsWithBackspace: wordsWithBs.size,
    wordsRecovered,
    wordsFailed,
    consecutiveRuns: consecutiveRuns.length,
    totalConsecutiveLength,
    maxConsecutiveLength,
  };
}

export function computeTestAnalytics(
  keystrokes: KeystrokeEvent[],
  backspaceEvents: BackspaceEvent[],
  wordEvents: WordEvent[],
  consecutiveRuns: number[],
  testDurationSec: number
): TestAnalytics {
  const backspaceStats = computeBackspaceStats(backspaceEvents, wordEvents, consecutiveRuns);

  return {
    keyStats: computeKeyStats(keystrokes),
    bigramStats: computeBigramStats(keystrokes),
    windows: computeWindows(keystrokes, wordEvents, testDurationSec),
    backspaceStats,
    totalBackspaces: backspaceEvents.length,
    totalKeystrokes: keystrokes.length,
    wordsAttempted: wordEvents.length,
  };
}
