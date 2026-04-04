export interface TestAnalytics {
  keyStats: Record<string, { correct: number; errors: number; avgLatencyMs: number }>;
  bigramStats: Array<{ bigram: string; avgLatencyMs: number; count: number }>;
  windows: Array<{ startSec: number; wpm: number; accuracy: number; keystrokes: number }>;
  totalBackspaces: number;
  totalKeystrokes: number;
  wordsAttempted: number;
}

export interface KeystrokeEvent {
  key: string;
  expected: string;
  ts: number;
  correct: boolean;
  wordIdx: number;
  pos: number;
}

export interface WordEvent {
  word: string;
  typed: string;
  correct: boolean;
  ts: number;
}

export interface AnalyticsProfile {
  totalTests: number;
  rollingKeyStats: Record<string, { correct: number; errors: number; totalLatencyMs: number; count: number }>;
  rollingBigramStats: Record<string, { totalLatencyMs: number; count: number }>;
  fatigueArchetype: string;
  weakestKeys: Array<{ key: string; errorRate: number; avgLatencyMs: number }>;
  slowestBigrams: Array<{ bigram: string; avgLatencyMs: number; count: number }>;
  recentWpm: number[];
  recentAccuracy: number[];
  wpmTrend: number;
  lastWindows: Array<{ startSec: number; wpm: number; accuracy: number; keystrokes: number }>;
  updatedAt: string;
}
