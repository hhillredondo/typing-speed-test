import { computeTestAnalytics } from "./computeAnalytics";
import type {
  BackspaceEvent,
  KeystrokeEvent,
  WordEvent,
} from "../../../types/analytics";

const k = (
  key: string,
  ts: number,
  wordIdx: number,
  pos: number,
  correct = true,
  expected = key
): KeystrokeEvent => ({ key, expected, ts, wordIdx, pos, correct });

describe("computeTestAnalytics", () => {
  test("aggregates per-key stats with case-folding and ignores cross-word latency", () => {
    const keystrokes: KeystrokeEvent[] = [
      k("h", 0, 0, 0),
      k("i", 100, 0, 1),
      k("H", 5000, 1, 0),       // different word — latency vs prev should be ignored
      k("e", 5120, 1, 1, false, "i"),
      k("l", 5240, 1, 2),
      k("p", 5360, 1, 3, false, "x"),
    ];
    const out = computeTestAnalytics(keystrokes, [], [], [], 60);

    expect(out.keyStats.h.correct).toBe(2); // "h" + "H" merged
    expect(out.keyStats.h.errors).toBe(0);
    expect(out.keyStats.i.correct).toBe(1);
    expect(out.keyStats.e.errors).toBe(1);
    expect(out.keyStats.p.errors).toBe(1);

    // 'h' has no in-word predecessor, so no latency samples
    expect(out.keyStats.h.avgLatencyMs).toBe(0);
    // 'i' follows 'h' in same word → latency 100ms
    expect(out.keyStats.i.avgLatencyMs).toBe(100);
  });

  test("rejects unreasonable latencies (>5s)", () => {
    const keystrokes: KeystrokeEvent[] = [
      k("a", 0, 0, 0),
      k("b", 6000, 0, 1), // 6s gap — should be discarded
    ];
    const out = computeTestAnalytics(keystrokes, [], [], [], 60);
    expect(out.keyStats.b.avgLatencyMs).toBe(0);
  });

  test("computes bigrams only for adjacent same-word positions, drops single-occurrence bigrams", () => {
    const keystrokes: KeystrokeEvent[] = [
      k("t", 0, 0, 0),
      k("h", 100, 0, 1),
      k("e", 200, 0, 2),
      k("t", 1000, 1, 0),
      k("h", 1150, 1, 1),
      k("e", 1300, 1, 2),
      // "ab" appears only once → should be filtered
      k("a", 2000, 2, 0),
      k("b", 2100, 2, 1),
    ];
    const out = computeTestAnalytics(keystrokes, [], [], [], 60);
    const bigramKeys = out.bigramStats.map((b) => b.bigram);
    expect(bigramKeys).toContain("th");
    expect(bigramKeys).toContain("he");
    expect(bigramKeys).not.toContain("ab");

    const th = out.bigramStats.find((b) => b.bigram === "th");
    expect(th?.count).toBe(2);
    expect(th?.avgLatencyMs).toBe(125); // (100 + 150) / 2
  });

  test("buckets keystrokes into 10s windows and computes wpm from completed words", () => {
    const keystrokes: KeystrokeEvent[] = [
      k("a", 1000, 0, 0),
      k("a", 11000, 1, 0),
      k("a", 21000, 2, 0),
    ];
    const wordEvents: WordEvent[] = [
      { word: "a", typed: "a", correct: true, ts: 1500, wordIdx: 0 },
      { word: "a", typed: "a", correct: true, ts: 11500, wordIdx: 1 },
      { word: "a", typed: "x", correct: false, ts: 21500, wordIdx: 2 }, // wrong: doesn't count
    ];
    const out = computeTestAnalytics(keystrokes, [], wordEvents, [], 30);

    expect(out.windows).toHaveLength(3);
    expect(out.windows[0].wpm).toBe(6); // 1 correct word in 10s = 6 wpm
    expect(out.windows[1].wpm).toBe(6);
    expect(out.windows[2].wpm).toBe(0); // wrong word doesn't count
  });

  test("backspace stats split recovered vs failed words", () => {
    const backspaceEvents: BackspaceEvent[] = [
      { ts: 100, wordIdx: 0 },
      { ts: 200, wordIdx: 0 },
      { ts: 300, wordIdx: 1 },
    ];
    const wordEvents: WordEvent[] = [
      { word: "hi", typed: "hi", correct: true, ts: 500, wordIdx: 0 },
      { word: "ok", typed: "ko", correct: false, ts: 600, wordIdx: 1 },
      { word: "no", typed: "no", correct: true, ts: 700, wordIdx: 2 }, // no backspace, ignored
    ];
    const out = computeTestAnalytics([], backspaceEvents, wordEvents, [2, 1], 30);

    expect(out.backspaceStats.totalBackspaces).toBe(3);
    expect(out.backspaceStats.wordsWithBackspace).toBe(2);
    expect(out.backspaceStats.wordsRecovered).toBe(1);
    expect(out.backspaceStats.wordsFailed).toBe(1);
    expect(out.backspaceStats.consecutiveRuns).toBe(2);
    expect(out.backspaceStats.totalConsecutiveLength).toBe(3);
    expect(out.backspaceStats.maxConsecutiveLength).toBe(2);
  });

  test("returns counters consistent with input lengths", () => {
    const keystrokes: KeystrokeEvent[] = [
      k("a", 0, 0, 0),
      k("b", 50, 0, 1),
    ];
    const wordEvents: WordEvent[] = [
      { word: "ab", typed: "ab", correct: true, ts: 100, wordIdx: 0 },
    ];
    const out = computeTestAnalytics(keystrokes, [], wordEvents, [], 60);
    expect(out.totalKeystrokes).toBe(2);
    expect(out.wordsAttempted).toBe(1);
    expect(out.totalBackspaces).toBe(0);
  });
});
