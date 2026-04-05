# AI coaching and practice passages

This document describes **optional AI features** powered by **Amazon Bedrock**: personalized coaching summaries on the Analytics page, and AI-generated practice paragraphs in Weakness Drill. It matches the implementation in the Lambda API (`infra/lambda/api/index.js`) and the React client.

**Prerequisites:** Users need enough completed tests for coaching (see below). Drill passages require at least one scored test with analytics.

---

## 1. AI Coach (Analytics page)

### 1.1 What the user sees

On **Analytics**, logged-in users with **at least three** completed tests see an **AI Coach** card with:

- A short **natural-language summary** (encouragement, strengths, and concrete tips based on their stats).
- A **badge** indicating why coaching was regenerated: **New Personal Best**, **Milestone** (every fifth test), or **Weekly Check-in** (more than seven days since the last coaching).
- The **date** the text was generated.
- **Refresh** — re-fetches coaching from the API. This does **not** always call Bedrock again; see §1.5.

### 1.2 When new coaching is generated (notable sessions)

After each scored test, the backend may set **`coachingStale: true`** on the user’s `ANALYTICS` item if **any** of these hold:

- The test count is divisible by **5** (milestone).
- The new score is a **personal best** compared to all previous scores in `recentWpm` (excluding the current one).
- **More than seven days** have passed since **`lastCoachingAt`**.

Stale coaching triggers a **new Bedrock call** the next time the coaching endpoint runs and cache rules allow it.

### 1.3 Endpoint: `GET /api/coaching`

Authenticated with **Bearer token** (`Authorization` header).

1. Loads **`ANALYTICS`** for the user.
2. If **`totalTests < 3`**, returns `{ available: false, message: "..." }`.
3. Reads the cached item **`pk = USER#<sub>`**, **`sk = COACH`**.
4. If a cache row exists, **`ttl`** is still in the future, and **`coachingStale`** is **false**, returns the **cached** summary — **no Bedrock call**.
5. Otherwise builds a **prompt** from rolling stats (average WPM, trend, accuracy, fatigue archetype, weakest keys, slowest bigrams) and calls Bedrock **`ConverseCommand`** (max **300** output tokens, temperature **0.7**).
6. Writes the result to DynamoDB with a **7-day TTL** and sets **`coachingStale = false`**, **`lastCoachingAt`**.

Response shape when available: `{ available: true, summary, generatedAt, trigger }` where **`trigger`** is `new_pb`, `milestone`, or `periodic`.

On Bedrock failure, the API returns `{ available: false, message: "..." }` so the UI can show a friendly message without exposing errors.

### 1.4 Model ID and regions

Bedrock often requires a **regional inference profile** ID instead of the bare foundation model ID. The Lambda resolves the model from **`AWS_REGION`** when **`BEDROCK_MODEL_ID`** is unset, for example:

| Region prefix | Example inference profile |
|---------------|---------------------------|
| `eu-*` | `eu.amazon.nova-micro-v1:0` |
| `us-*` | `us.amazon.nova-micro-v1:0` |
| `ap-*` | `apac.amazon.nova-micro-v1:0` |
| (other) | `us.amazon.nova-micro-v1:0` (fallback) |

You can override by setting **`BEDROCK_MODEL_ID`** on the Lambda function. Enable **model access** for the chosen model in the AWS Bedrock console for your account and region.

### 1.5 Caching and the Refresh button

- **Cached hit:** Same summary is returned; **no** extra Bedrock usage.
- **Regeneration:** Bedrock runs when the cache is missing, **expired**, or **`coachingStale`** is true.

So **Refresh** is “load coaching again,” not “always generate new text.” Repeated refreshes while the cache is valid do **not** consume additional model tokens.

---

## 2. AI Practice (Weakness Drill)

### 2.1 What the user sees

On **Weakness Drill**, users can switch **Word Drill** (words from `en.json` scored by weakness) and **AI Practice**.

**AI Practice** calls **`POST /api/drill/passage`** with an optional body `{ "refresh": true }` to bypass cache and request a **new** paragraph.

The returned **passage** is split into **words** and typed with the same mechanics as Word Drill. **New Passage** forces a refresh when allowed by the server.

### 2.2 Endpoint: `POST /api/drill/passage`

1. Requires Bearer token.
2. Loads **`ANALYTICS`** for weak keys and slow bigrams.
3. If **`totalTests < 1`**, returns `{ available: false, message: "..." }`.
4. Builds a cache key from sorted weak keys and bigrams: **`sk = PASSAGE#<hash>`**.
5. If a cached item exists, **TTL** not expired, and **`refresh`** is not true, returns cached **passage**.
6. Otherwise prompts Bedrock for an **80–120 word** paragraph that naturally includes those patterns, then caches with a **24-hour TTL**.

Max output tokens for passages: **400**. Temperature: **0.7** (same `callBedrock` helper as coaching).

### 2.3 Why it exists

Word Drill optimizes **word lists** from a fixed dictionary. AI Practice generates **connected prose** so users can practice **flow and punctuation spacing** while still emphasizing weak keys and bigrams. Drill sessions **do not** submit scores or update analytics.

---

## 3. DynamoDB cache items (TTL)

The application table uses a **`ttl`** attribute; DynamoDB deletes expired items automatically.

| Purpose | `pk` | `sk` | Typical TTL |
|---------|------|------|-------------|
| Coaching text | `USER#<sub>` | `COACH` | 7 days from write |
| Drill passage | `USER#<sub>` | `PASSAGE#<weakness-hash>` | 24 hours from write |

---

## 4. AWS permissions and cost notes

- The API Lambda execution role includes **`bedrock:InvokeModel`** (see CDK stack).
- **Cost control:** Prefer caching, **Nova Micro** (or similar small model) via inference profile, and regeneration only when stale or on explicit passage refresh.
- **Privacy:** Prompts contain **aggregated** analytics (no raw keystroke logs).

---

## 5. Related files

| Area | Path |
|------|------|
| Coaching & passage handlers | `infra/lambda/api/index.js` (`handleGetCoaching`, `handleGeneratePassage`, `callBedrock`, `resolveBedrockModelId`) |
| Infrastructure (Bedrock IAM, optional env) | `infra/lib/typing-speed-stack.ts` |
| API client | `src/state/scoreServices.ts` (`getCoaching`, `generateDrillPassage`) |
| Analytics UI | `src/components/Analytics/Analytics.tsx` |
| Drill UI | `src/components/DrillMode/DrillMode.tsx` |
| Types | `src/types/analytics.ts` (`CoachingResponse`, `PassageResponse`, profile fields) |

For statistical analytics (heatmap, trends, drills without AI), see [Typing analytics](./analytics.md).
