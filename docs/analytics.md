# Typing analytics (Phase 3A)

This document describes **what data the app collects**, **how it is turned into metrics**, and **how those metrics are stored and shown**. It matches the current implementation in the React client and the Lambda API.

**Scope:** Analytics apply to **logged-in users** completing the **standard 60-second test** on the home screen (`src/components/Test/Test.tsx`). **Weakness Drill** sessions do **not** call the API and do **not** update analytics or leaderboards.

---

## 1. High-level flow

1. During a test, the browser records **keystroke-level events** and **word completions** in memory (refs only, to avoid extra re-renders).
2. When the timer hits zero, the client runs **`computeTestAnalytics`** to produce a **compact summary** (`TestAnalytics`). Raw per-keystroke arrays are **not** sent to the server.
3. The client POSTs **`POST /api/scores`** with score metadata plus `analytics`.
4. The API stores one **SCORE** row (including `analytics`) and updates the user’s **ANALYTICS** profile (rolling aggregates + derived fields).
5. The Analytics page loads **`GET /api/analytics`** and renders heatmap, tables, charts, archetype, and template-based tips.

---

## 2. Data collected in the browser (per test)

All timing uses `performance.now()` relative to the moment the first key starts the test (`testStartTimeRef`).

### 2.1 Keystroke events

For each printable key press **while the test is running** (including the first key that starts the test), we append a **`KeystrokeEvent`**:

| Field       | Meaning |
|------------|---------|
| `key`      | Character typed (as reported by the keyboard event). |
| `expected` | Character at the current position in the target word (empty if past end of word). |
| `ts`       | Milliseconds since test start. |
| `correct`  | Whether `key` equals `expected` at that position. |
| `wordIdx`  | Index of the word in the shuffled list. |
| `pos`      | Index within the current word (length of input before this key). |

Backspace is **not** stored as a keystroke event; we only count backspaces (see below).

### 2.2 Word completion events

On **Space**, when submitting a word, we append a **`WordEvent`**:

| Field     | Meaning |
|----------|---------|
| `word`   | Target word. |
| `typed`  | What the user had typed for that word. |
| `correct`| Whether `typed === word`. |
| `ts`     | Time of submission (ms since test start). |
| `wordIdx`| Index of the word in the shuffled list (used to correlate with backspace events). |

### 2.3 Backspace events

On each Backspace we append a **`BackspaceEvent`**:

| Field     | Meaning |
|----------|---------|
| `ts`     | Milliseconds since test start. |
| `wordIdx`| Index of the word the user was editing when they pressed Backspace. |

We also track **consecutive backspace runs** in a separate array. A "run" starts when the user presses Backspace and ends when they press any other key (printable or Space). On each Backspace, a counter increments; when a non-Backspace key is pressed (or the test ends), the counter is flushed into the runs list. This gives us the length of every burst of consecutive backspaces.

### 2.4 Session summary fields (also sent)

These are computed from existing UI state, not from the raw event arrays:

- **`score`**: number of **correct word submissions** in the test (shown as “WPM” in the UI; it is words completed in one minute, not a keystroke-based WPM formula).
- **`accuracy`**: `round(correctKeys / totalKeys * 100)`, or 100% if no keys.
- **`mistakes`**: word submissions where the typed text did not match the target word.

---

## 3. Per-test aggregation (`computeTestAnalytics`)

**File:** `src/components/Test/utils/computeAnalytics.ts`

The output type is **`TestAnalytics`** (`src/types/analytics.ts`):

- `keyStats`
- `bigramStats`
- `windows`
- `backspaceStats`
- `totalBackspaces`
- `totalKeystrokes`
- `wordsAttempted`

Latencies above **5000 ms** between consecutive keys are ignored as invalid.

### 3.1 Per-key stats (`keyStats`)

For each distinct key (lowercased):

- **`correct` / `errors`**: counts of presses where the character matched / did not match the expected character.
- **`avgLatencyMs`**: for that key, average time from the **previous keystroke in the same word** to this keystroke, across presses where that interval is valid (0 &lt; Δt &lt; 5000 ms). The first key of a word does not contribute a latency sample for this average in the same way (previous event may be on another word).

So “average latency” here reflects **inter-key timing within a word**, keyed by the **pressed** character.

### 3.2 Bigram stats (`bigramStats`)

We consider pairs of **consecutive keystrokes within the same word** where the second key’s position is exactly **previous position + 1**. The bigram label is built from **`expected`** characters: `(expected_prev + expected_curr)`, lowercased.

For each bigram we sum latencies (Δt between the two keys) and counts. Only bigrams with **at least 2 occurrences** in that test are kept. We sort by **slowest average latency** and keep the **top 20** for that test.

### 3.3 Time windows (`windows`)

The 60-second test is split into **10-second** buckets (six windows: 0–10s … 50–60s).

For each window:

- **`wpm`**: `(number of correctly submitted words whose completion time falls in this window) × (60 / 10)`  
  i.e. correct words in that 10s slice, scaled to a per-minute rate **for that slice** (so it is comparable across windows).
- **`accuracy`**: among keystrokes whose `ts` falls in the window, `correct / total` as a percentage (100% if no keystrokes).
- **`keystrokes`**: count of keystroke events in the window.

### 3.4 Backspace stats (`backspaceStats`)

Correlates backspace events with word outcomes to measure how effectively the user uses Backspace.

| Field | Definition |
|-------|------------|
| **`totalBackspaces`** | Total backspace presses in this test. |
| **`wordsWithBackspace`** | Number of distinct words where Backspace was used at least once (unique `wordIdx` values in the backspace events). |
| **`wordsRecovered`** | Of those words, how many were **submitted correctly**. This means the user caught their mistake, corrected it, and got the word right. |
| **`wordsFailed`** | Of those words, how many were **still submitted incorrectly** despite using Backspace. |
| **`consecutiveRuns`** | Number of backspace "bursts" (contiguous sequences of Backspace presses with no other keys between them). |
| **`totalConsecutiveLength`** | Sum of all burst lengths (for computing average burst length). |
| **`maxConsecutiveLength`** | Length of the longest single backspace burst. |

**Example:** Typing `helol` → Backspace → Backspace → `lo` → Space (submitting `hello` correctly) produces one burst of length 2, and that word is counted as **recovered**.

### 3.5 Totals

- **`totalBackspaces`**: length of the backspace event list (also in `backspaceStats.totalBackspaces`).
- **`totalKeystrokes`**: length of the keystroke event list (printable keys only, not backspaces).
- **`wordsAttempted`**: number of word submissions (Space with non-empty input).

---

## 4. API and storage

### 4.1 Submitting a result

**`POST /api/scores`** body (relevant fields):

```json
{
  "user": "<cognito sub>",
  "userName": "...",
  "score": 72,
  "accuracy": 98,
  "mistakes": 3,
  "analytics": { ... TestAnalytics ... }
}
```

If the user is not logged in, the client does not send the request; no analytics are stored.

### 4.2 DynamoDB: SCORE item

Each score is stored with partition key `USER#<sub>` and sort key `SCORE#<ISO time>#<uuid>`, plus GSI fields for the global leaderboard. The item may include **`accuracy`**, **`mistakes`**, and **`analytics`** (the full per-test summary).

### 4.3 DynamoDB: ANALYTICS item

**Key:** `pk = USER#<sub>`, `sk = ANALYTICS`

Updated **after each scored test** when `analytics` is present (`infra/lambda/api/index.js` → `updateAnalyticsProfile`).

**Rolling merge:**

- **`totalTests`**: incremented by 1.
- **`rollingKeyStats`**: for each letter in `analytics.keyStats`, we add `correct`, `errors`, and we merge latency by  
  `totalLatencyMs += avgLatencyMs * (correct + errors)` and  
  `count += correct + errors`  
  so server-side **`totalLatencyMs / count`** matches a weighted average across tests.
- **`rollingBigramStats`**: for each entry in `analytics.bigramStats`,  
  `totalLatencyMs += avgLatencyMs * count` and `count += count` (weighted by occurrences in each test).
- **`rollingBackspaceStats`**: adds per-test `backspaceStats` fields into running totals:
  - `totalBackspaces` (sum across all tests)
  - `wordsWithBackspace` (sum)
  - `wordsRecovered` (sum)
  - `wordsFailed` (sum)
  - `totalConsecutiveRuns` (sum of burst counts across all tests)
  - `totalConsecutiveLength` (sum of all burst lengths across all tests; average burst = `totalConsecutiveLength / totalConsecutiveRuns`)

**History arrays (last 50 tests):**

- **`recentWpm`**: each test’s `score`.
- **`recentAccuracy`**: each test’s `accuracy`, or 100 if missing.

**Derived fields (recomputed after each update):**

| Field | Definition |
|-------|------------|
| **`weakestKeys`** | Keys with **≥ 5** total presses (`correct + errors`) in `rollingKeyStats`, sorted by **error rate** `errors / (correct + errors)` descending, **top 5**. Includes **`avgLatencyMs`** from rolling totals. |
| **`slowestBigrams`** | Bigrams with **≥ 4** total occurrences in `rollingBigramStats`, sorted by **average latency** descending, **top 5**. |
| **`fatigueArchetype`** | See §5 (from **latest test’s** `windows` only). |
| **`wpmTrend`** | See §6 (from `recentWpm`). |
| **`lastWindows`** | Copy of **`analytics.windows`** from the **most recent** submitted test (used for “Latest Test Pacing”). |
| **`updatedAt`** | ISO timestamp. |

---

## 5. Fatigue archetype (`classifyFatigueArchetype`)

Computed **only from the latest test’s** `windows` array. If there are fewer than **3** windows, the archetype is **`unknown`**.

Let `wpms` = each window’s `wpm`, `peak` = max(`wpms`). If `peak === 0`, **`unknown`**.

Otherwise:

1. **`cliff-dropper`**: last window’s WPM **&lt; 80%** of `peak`.
2. Else **`fast-starter`**: average WPM of the **first half** of windows **&gt; 115%** of the average of the **second half**.
3. Else **`slow-warmer`**: second-half average **&gt; 110%** of first-half average.
4. Else **`consistent`**.

“First half” / “second half” split uses `Math.ceil(length / 2)` for the split index (see code).

---

## 6. WPM trend (`computeWpmTrend`)

- Uses **`recentWpm`** (up to 50 points).
- If fewer than **3** tests, trend is **0**.
- Otherwise: **least-squares linear regression** of WPM vs. test index `0 … n-1`. The returned value is the **slope** (WPM change per test), rounded to two decimal places.

The Analytics UI shows an up / flat / down icon using thresholds **±0.5** on this slope.

---

## 7. How the Analytics page uses the data

**Data source:** `GET /api/analytics` (Bearer token) → `AnalyticsProfile`.

| UI area | Data used |
|---------|-----------|
| Summary cards | `totalTests`; average of `recentWpm` and `recentAccuracy`. |
| Trend icon | `wpmTrend` vs ±0.5. |
| Typing profile chip | `fatigueArchetype` → fixed labels/tips in `ARCHETYPE_INFO`. |
| Template insights | `generateInsights()` in `Analytics.tsx`: top weak keys, slowest bigram, trend sentences. |
| Keyboard heatmap | `rollingKeyStats`: color by **error rate** per key; tooltip shows error %, total presses, rolling avg latency. |
| Weakest keys table | `weakestKeys` from API. |
| Slowest bigrams table | `slowestBigrams` from API. |
| Backspace analysis | `rollingBackspaceStats` + `totalTests`: avg backspaces/test, words recovered, words failed, recovery rate, burst count, avg burst length. |
| Latest test pacing chart | `lastWindows`. |
| WPM progress chart | `recentWpm` (line vs. test index). |

---

## 8. Weakness Drill (read-only)

**`src/components/DrillMode/generateDrillWords.ts`** loads the same **`AnalyticsProfile`** and scores words from `en.json` by how many **weak keys** and **slowest bigrams** they contain. If there are no weak keys and no slowest bigrams in the profile, the word list is **fully random** (same pool as a normal test).

Drill sessions **do not** POST scores and **do not** change `ANALYTICS`.

---

## 9. Related files

| Area | Path |
|------|------|
| Keystroke capture & submit | `src/components/Test/Test.tsx` |
| Per-test aggregation | `src/components/Test/utils/computeAnalytics.ts` |
| Types | `src/types/analytics.ts` |
| API client | `src/state/scoreServices.ts` |
| Analytics UI | `src/components/Analytics/*.tsx` |
| Drill word list | `src/components/DrillMode/generateDrillWords.ts` |
| Backend | `infra/lambda/api/index.js` (`handleCreateScore`, `updateAnalyticsProfile`, `handleGetAnalytics`, …) |

---

## 10. Design notes

- **Privacy / payload size:** Raw keystroke logs stay in the browser; only **aggregates** are sent and stored.
- **Cost:** No extra AWS services; analytics live in the existing DynamoDB table and Lambda.
- **Leaderboard:** Global scores still use **`score`** (words per minute count); optional `accuracy` on items is not required for sorting.

If you change formulas (windows, bigram rules, thresholds), update this document and the tests together so the UI and docs stay aligned.
