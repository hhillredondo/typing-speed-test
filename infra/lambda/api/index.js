const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const crypto = require("crypto");
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const {
  resolveBedrockModelId,
  isNotableSession,
  computeWeakestKeys,
  computeSlowestBigrams,
  classifyFatigueArchetype,
  computeWpmTrend,
  determineTrigger,
} = require("./pure");

const TABLE = process.env.TABLE_NAME;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});
const bedrock = new BedrockRuntimeClient({});

// Set ALLOWED_ORIGIN to the CloudFront distribution URL. Falls back to "*" only
// when unset (local `sam local` / curl testing), never silently in a deployed stack.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  Vary: "Origin",
};

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString()
      : event.body);
  } catch {
    return {};
  }
}

// Verifies the RS256 signature against the Cognito JWKS, plus issuer, expiry,
// audience (client id) and token_use. aws-jwt-verify caches the JWKS and refetches
// on key rotation, so this is a network call only on cold start / rotation.
//
// Never parse a JWT without verifying it: the payload is attacker-controlled until
// the signature checks out.
const jwtVerifier =
  USER_POOL_ID && CLIENT_ID
    ? CognitoJwtVerifier.create({
        userPoolId: USER_POOL_ID,
        tokenUse: "id",
        clientId: CLIENT_ID,
      })
    : null;

/**
 * Resolve the caller's verified claims, or null if the request is unauthenticated
 * or the token fails verification for any reason.
 */
async function authenticate(event) {
  if (!jwtVerifier) {
    console.error("JWT verifier not configured: COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID missing");
    return null;
  }
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    return await jwtVerifier.verify(token);
  } catch (err) {
    console.warn("Token verification failed:", err.message);
    return null;
  }
}

const UNAUTHORIZED = response(401, { message: "Not authorized" });

const MAX_USERNAME_LENGTH = 64;
const MAX_ANALYTICS_BYTES = 64 * 1024;

/**
 * Reject oversized analytics payloads rather than persisting whatever the client
 * sends. DynamoDB items are capped at 400 KB and every byte here is attacker-chosen.
 */
function boundedAnalytics(analytics) {
  if (!analytics || typeof analytics !== "object") return null;
  if (Buffer.byteLength(JSON.stringify(analytics), "utf8") > MAX_ANALYTICS_BYTES) {
    console.warn("Rejected oversized analytics payload");
    return null;
  }
  return analytics;
}


// ── Auth routes ──

async function handleRegister(event) {
  const { name, email, password } = parseBody(event);
  if (!name || !email || !password) {
    return response(400, { message: "Please add all fields" });
  }

  try {
    await cognito.send(new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "name", Value: name },
        { Name: "email", Value: email },
      ],
    }));

    return response(201, { message: "Verification code sent to your email" });
  } catch (err) {
    if (err.name === "UsernameExistsException") {
      return response(400, { message: "User already exists" });
    }
    if (err.name === "InvalidPasswordException") {
      return response(400, { message: err.message });
    }
    return response(500, { message: err.message });
  }
}

async function handleConfirmSignUp(event) {
  const { email, password, code } = parseBody(event);
  if (!email || !password || !code) {
    return response(400, { message: "Please provide email, password, and verification code" });
  }

  try {
    await cognito.send(new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    }));

    const authResult = await cognito.send(new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));

    const idToken = authResult.AuthenticationResult.IdToken;
    const claims = await jwtVerifier.verify(idToken);

    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `USER#${claims.sub}`,
        sk: "PROFILE",
        name: claims.name || "",
        email: claims.email,
        createdAt: new Date().toISOString(),
      },
    }));

    return response(200, {
      _id: claims.sub,
      name: claims.name || "",
      email: claims.email,
      token: idToken,
    });
  } catch (err) {
    if (err.name === "CodeMismatchException") {
      return response(400, { message: "Invalid verification code" });
    }
    if (err.name === "ExpiredCodeException") {
      return response(400, { message: "Verification code has expired, please request a new one" });
    }
    if (err.name === "NotAuthorizedException") {
      return response(400, { message: "Invalid credentials" });
    }
    return response(500, { message: err.message });
  }
}

async function handleResendCode(event) {
  const { email } = parseBody(event);
  if (!email) {
    return response(400, { message: "Please provide an email" });
  }

  try {
    await cognito.send(new ResendConfirmationCodeCommand({
      ClientId: CLIENT_ID,
      Username: email,
    }));
    return response(200, { message: "Verification code resent" });
  } catch (err) {
    if (err.name === "UserNotFoundException") {
      return response(400, { message: "User not found" });
    }
    if (err.name === "InvalidParameterException") {
      return response(400, { message: "User is already confirmed" });
    }
    return response(500, { message: err.message });
  }
}

async function handleLogin(event) {
  const { email, password } = parseBody(event);
  if (!email || !password) {
    return response(400, { message: "Please add all fields" });
  }

  try {
    const authResult = await cognito.send(new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));

    const idToken = authResult.AuthenticationResult.IdToken;
    const claims = await jwtVerifier.verify(idToken);

    return response(200, {
      _id: claims.sub,
      name: claims.name || "",
      email: claims.email,
      token: idToken,
    });
  } catch (err) {
    const status = err.name === "NotAuthorizedException" ||
                   err.name === "UserNotFoundException" ? 400 : 500;
    return response(status, { message: "Invalid credentials" });
  }
}

async function handleGetMe(event) {
  const claims = await authenticate(event);
  if (!claims) return UNAUTHORIZED;

  return response(200, {
    id: claims.sub,
    name: claims.name || "",
    email: claims.email,
  });
}

async function deleteAllUserDdbItems(userId) {
  const pk = `USER#${userId}`;
  let lastKey;
  do {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items || []) {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { pk: item.pk, sk: item.sk },
      }));
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
}

async function handleDeleteAccount(event) {
  const authHeader = event.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return response(401, { message: "Not authorized, no token" });
  }

  const { password } = parseBody(event);
  if (!password) {
    return response(400, { message: "Password is required to delete your account" });
  }

  const claims = await authenticate(event);
  if (!claims) return UNAUTHORIZED;

  // email and sub must come from the same verified token and are never taken as
  // independent inputs: re-authenticating one while deleting data keyed on the
  // other would let a caller destroy another user's records.
  const email = claims.email;
  const sub = claims.sub;
  if (!email) {
    return response(400, { message: "Could not resolve user email" });
  }

  try {
    await cognito.send(new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));
  } catch (err) {
    if (err.name === "NotAuthorizedException" || err.name === "UserNotFoundException") {
      return response(400, { message: "Invalid password" });
    }
    return response(500, { message: err.message });
  }

  try {
    await deleteAllUserDdbItems(sub);
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    }));
    return response(200, { message: "Account deleted" });
  } catch (err) {
    console.error("Delete account failed:", err);
    return response(500, { message: err.message || "Failed to delete account" });
  }
}

// ── Score routes ──

async function handleCreateScore(event) {
  const body = parseBody(event);

  // Anonymous submissions stay supported, but a *claimed* identity must be proved:
  // the caller's id and display name come from the verified token, never from the body.
  const claims = await authenticate(event);
  const userId = claims ? claims.sub : "anonymous";
  const userName = claims
    ? claims.name || claims.email || "Anonymous"
    : String(body.userName || "Anonymous").slice(0, MAX_USERNAME_LENGTH);

  const score = Number(body.score) || 0;
  const accuracy = body.accuracy ?? null;
  const mistakes = body.mistakes ?? null;
  const analytics = boundedAnalytics(body.analytics);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const item = {
    pk: userId !== "anonymous" ? `USER#${userId}` : "USER#anonymous",
    sk: `SCORE#${now}#${id}`,
    gsi1pk: "SCORE",
    gsi1sk: now,
    scoreId: id,
    userId,
    userName,
    score,
    createdAt: now,
  };
  if (accuracy !== null) item.accuracy = accuracy;
  if (mistakes !== null) item.mistakes = mistakes;
  if (analytics) item.analytics = analytics;

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

  if (userId !== "anonymous" && analytics) {
    await updateAnalyticsProfile(userId, score, accuracy, mistakes, analytics).catch((err) =>
      console.error("Analytics update failed (non-fatal):", err)
    );
  }

  return response(201, {
    _id: id,
    user: userId,
    userName,
    score,
    accuracy,
    mistakes,
    createdAt: now,
  });
}

async function handleGetScores(event) {
  const claims = await authenticate(event);
  const callerId = claims ? claims.sub : null;

  const result = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :pk",
    ExpressionAttributeValues: { ":pk": "SCORE" },
    ScanIndexForward: false,
    Limit: 500,
  }));

  // No user identifier is returned: the leaderboard is public, and echoing
  // item.userId here enumerated every user's Cognito sub. The caller only needs
  // to know which rows are theirs.
  const scores = (result.Items || []).map((item) => ({
    _id: item.scoreId,
    isMine: callerId !== null && item.userId === callerId,
    userName: item.userName || "Anonymous",
    score: item.score,
    accuracy: item.accuracy ?? null,
    createdAt: item.createdAt,
  }));

  return response(200, scores);
}

// ── Analytics ──

const RECENT_HISTORY_SIZE = 50;

function newBackspaceStats() {
  return {
    totalBackspaces: 0, wordsWithBackspace: 0,
    wordsRecovered: 0, wordsFailed: 0,
    totalConsecutiveRuns: 0, totalConsecutiveLength: 0,
  };
}

function mergeKeyStats(rolling, keyStats) {
  for (const [key, stats] of Object.entries(keyStats)) {
    if (!rolling[key]) {
      rolling[key] = { correct: 0, errors: 0, totalLatencyMs: 0, count: 0 };
    }
    const r = rolling[key];
    r.correct += stats.correct;
    r.errors += stats.errors;
    r.totalLatencyMs += stats.avgLatencyMs * (stats.correct + stats.errors);
    r.count += stats.correct + stats.errors;
  }
}

function mergeBigramStats(rolling, bigramStats) {
  for (const bg of bigramStats) {
    if (!rolling[bg.bigram]) {
      rolling[bg.bigram] = { totalLatencyMs: 0, count: 0 };
    }
    const r = rolling[bg.bigram];
    r.totalLatencyMs += bg.avgLatencyMs * bg.count;
    r.count += bg.count;
  }
}

function mergeBackspaceStats(rolling, bs) {
  rolling.totalBackspaces += bs.totalBackspaces;
  rolling.wordsWithBackspace += bs.wordsWithBackspace;
  rolling.wordsRecovered += bs.wordsRecovered;
  rolling.wordsFailed += bs.wordsFailed;
  rolling.totalConsecutiveRuns += bs.consecutiveRuns;
  rolling.totalConsecutiveLength += bs.totalConsecutiveLength;
}

function mergeWindows(profile, windows) {
  if (!profile.rollingWindows) {
    profile.rollingWindows = windows.map((w) => ({
      startSec: w.startSec, totalWpm: 0, totalAccuracy: 0, count: 0,
    }));
  }
  for (let i = 0; i < windows.length && i < profile.rollingWindows.length; i++) {
    profile.rollingWindows[i].totalWpm += windows[i].wpm;
    profile.rollingWindows[i].totalAccuracy += windows[i].accuracy;
    profile.rollingWindows[i].count += 1;
  }
}

function computeAvgWindows(rollingWindows) {
  return (rollingWindows || []).map((rw) => ({
    startSec: rw.startSec,
    avgWpm: rw.count > 0 ? Math.round(rw.totalWpm / rw.count) : 0,
    avgAccuracy: rw.count > 0 ? Math.round(rw.totalAccuracy / rw.count) : 100,
    count: rw.count,
  }));
}

async function updateAnalyticsProfile(userId, score, accuracy, mistakes, analytics) {
  const pk = `USER#${userId}`;
  const sk = "ANALYTICS";

  const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk, sk } }));

  const profile = existing.Item || {
    pk, sk, totalTests: 0,
    rollingKeyStats: {}, rollingBigramStats: {},
    rollingBackspaceStats: newBackspaceStats(),
    recentWpm: [], recentAccuracy: [],
  };

  if (!profile.rollingBackspaceStats) {
    profile.rollingBackspaceStats = newBackspaceStats();
  }

  profile.totalTests += 1;

  if (analytics.keyStats) mergeKeyStats(profile.rollingKeyStats, analytics.keyStats);
  if (analytics.bigramStats) mergeBigramStats(profile.rollingBigramStats, analytics.bigramStats);
  if (analytics.backspaceStats) mergeBackspaceStats(profile.rollingBackspaceStats, analytics.backspaceStats);
  if (analytics.windows?.length > 0) mergeWindows(profile, analytics.windows);

  profile.recentWpm = [...profile.recentWpm, score].slice(-RECENT_HISTORY_SIZE);
  profile.recentAccuracy = [...profile.recentAccuracy, accuracy ?? 100].slice(-RECENT_HISTORY_SIZE);

  profile.weakestKeys = computeWeakestKeys(profile.rollingKeyStats);
  profile.slowestBigrams = computeSlowestBigrams(profile.rollingBigramStats);
  profile.fatigueArchetype = analytics.windows ? classifyFatigueArchetype(analytics.windows) : "unknown";
  profile.wpmTrend = computeWpmTrend(profile.recentWpm);
  profile.avgWindows = computeAvgWindows(profile.rollingWindows);
  profile.updatedAt = new Date().toISOString();

  if (isNotableSession(profile, score)) {
    profile.coachingStale = true;
  }

  await ddb.send(new PutCommand({ TableName: TABLE, Item: profile }));
}

async function handleGetAnalytics(event) {
  const claims = await authenticate(event);
  if (!claims) return UNAUTHORIZED;
  const userId = claims.sub;

  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: `USER#${userId}`, sk: "ANALYTICS" },
  }));

  if (!result.Item) {
    return response(200, { totalTests: 0 });
  }

  const { pk, sk, rollingWindows, ...profile } = result.Item;
  return response(200, profile);
}

async function handleGetAnalyticsHistory(event) {
  const claims = await authenticate(event);
  if (!claims) return UNAUTHORIZED;

  try {
    const userId = claims.sub;

    const result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":prefix": "SCORE#",
      },
      ScanIndexForward: false,
      Limit: 50,
    }));

    const history = (result.Items || []).map((item) => ({
      _id: item.scoreId,
      score: item.score,
      accuracy: item.accuracy ?? null,
      mistakes: item.mistakes ?? null,
      createdAt: item.createdAt,
      windows: item.analytics?.windows || null,
    }));

    return response(200, history);
  } catch {
    return response(401, { message: "Not authorized" });
  }
}

// ── Bedrock AI ──

const COACHING_TTL_SECONDS = 7 * 24 * 60 * 60;
const PASSAGE_TTL_SECONDS = 24 * 60 * 60;

async function callBedrock(prompt, maxTokens = 500) {
  const result = await bedrock.send(new ConverseCommand({
    modelId: resolveBedrockModelId(),
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens, temperature: 0.7 },
  }));
  return result.output.message.content[0].text;
}

function buildCoachingPrompt(profile) {
  const avgWpm = profile.recentWpm.length > 0
    ? Math.round(profile.recentWpm.reduce((a, b) => a + b, 0) / profile.recentWpm.length)
    : 0;
  const avgAcc = profile.recentAccuracy.length > 0
    ? Math.round(profile.recentAccuracy.reduce((a, b) => a + b, 0) / profile.recentAccuracy.length)
    : 100;
  const weakKeys = (profile.weakestKeys || [])
    .slice(0, 5)
    .map((k) => `${k.key} (${Math.round(k.errorRate * 100)}% error rate)`)
    .join(", ");
  const slowBigrams = (profile.slowestBigrams || [])
    .slice(0, 5)
    .map((b) => `"${b.bigram}" (${b.avgLatencyMs}ms)`)
    .join(", ");

  return [
    "You are a typing coach. Analyze this user's typing data and give a brief, encouraging coaching summary (3-5 sentences).",
    "",
    `Tests completed: ${profile.totalTests}`,
    `Average WPM: ${avgWpm}`,
    `WPM trend: ${profile.wpmTrend > 0 ? "+" : ""}${profile.wpmTrend} per test (positive = improving)`,
    `Average accuracy: ${avgAcc}%`,
    `Fatigue pattern: ${profile.fatigueArchetype}`,
    weakKeys ? `Weakest keys: ${weakKeys}` : "No significant weak keys yet.",
    slowBigrams ? `Slowest key combinations: ${slowBigrams}` : "No significant slow bigrams yet.",
    "",
    "Give actionable, personalized advice. Be encouraging but specific. Focus on 1-2 key areas for improvement. Do not use bullet points or lists — write in flowing prose.",
  ].join("\n");
}

function buildPassagePrompt(profile) {
  const weakKeys = (profile.weakestKeys || []).slice(0, 5).map((k) => k.key);
  const slowBigrams = (profile.slowestBigrams || []).slice(0, 5).map((b) => b.bigram);

  const constraints = [];
  if (weakKeys.length > 0) {
    constraints.push(`Include many words containing these letters: ${weakKeys.join(", ")}`);
  }
  if (slowBigrams.length > 0) {
    constraints.push(`Include words containing these letter combinations: ${slowBigrams.join(", ")}`);
  }
  if (constraints.length === 0) {
    constraints.push("Use a good mix of common English words.");
  }

  return [
    "Generate a natural-sounding paragraph of 80-120 words for typing practice.",
    ...constraints,
    "Keep sentences coherent and readable. Use common words — avoid jargon or very long words.",
    "Output ONLY the paragraph text, nothing else.",
  ].join("\n");
}

async function handleGetCoaching(event) {
  const claims = await authenticate(event);
  if (!claims) return UNAUTHORIZED;
  const userId = claims.sub;

  const pk = `USER#${userId}`;
  const profileResult = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk, sk: "ANALYTICS" } }));
  const profile = profileResult.Item;

  if (!profile || profile.totalTests < 3) {
    return response(200, { available: false, message: "Complete at least 3 tests to unlock AI coaching." });
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const cacheResult = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk, sk: "COACH" } }));
  const cached = cacheResult.Item;

  if (cached && cached.ttl > nowEpoch && !profile.coachingStale) {
    return response(200, {
      available: true,
      summary: cached.summary,
      generatedAt: cached.generatedAt,
      trigger: cached.trigger,
    });
  }

  try {
    const prompt = buildCoachingPrompt(profile);
    const summary = await callBedrock(prompt, 300);
    const generatedAt = new Date().toISOString();
    const trigger = determineTrigger(profile);

    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        pk, sk: "COACH",
        summary, generatedAt, trigger,
        ttl: nowEpoch + COACHING_TTL_SECONDS,
      },
    }));

    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { pk, sk: "ANALYTICS" },
      UpdateExpression: "SET coachingStale = :f, lastCoachingAt = :now",
      ExpressionAttributeValues: { ":f": false, ":now": generatedAt },
    }));

    return response(200, { available: true, summary, generatedAt, trigger });
  } catch (err) {
    console.error("Bedrock coaching call failed:", err);
    return response(200, {
      available: false,
      message: "AI coaching is temporarily unavailable. Please try again later.",
    });
  }
}

async function handleGeneratePassage(event) {
  const claims = await authenticate(event);
  if (!claims) return UNAUTHORIZED;
  const userId = claims.sub;

  const pk = `USER#${userId}`;
  const profileResult = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk, sk: "ANALYTICS" } }));
  const profile = profileResult.Item;

  if (!profile || profile.totalTests < 1) {
    return response(200, {
      available: false,
      message: "Complete at least one test to unlock AI practice passages.",
    });
  }

  const weakKeys = (profile.weakestKeys || []).slice(0, 5).map((k) => k.key).sort().join(",");
  const slowBigrams = (profile.slowestBigrams || []).slice(0, 5).map((b) => b.bigram).sort().join(",");
  const cacheKey = `PASSAGE#${weakKeys}|${slowBigrams}`;

  const nowEpoch = Math.floor(Date.now() / 1000);
  const cacheResult = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk, sk: cacheKey } }));
  const cached = cacheResult.Item;

  const body = parseBody(event);
  const forceRefresh = body.refresh === true;

  if (cached && cached.ttl > nowEpoch && !forceRefresh) {
    return response(200, { available: true, passage: cached.passage, generatedAt: cached.generatedAt });
  }

  try {
    const prompt = buildPassagePrompt(profile);
    const passage = await callBedrock(prompt, 400);
    const generatedAt = new Date().toISOString();

    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        pk, sk: cacheKey,
        passage, generatedAt,
        ttl: nowEpoch + PASSAGE_TTL_SECONDS,
      },
    }));

    return response(200, { available: true, passage, generatedAt });
  } catch (err) {
    console.error("Bedrock passage call failed:", err);
    return response(200, {
      available: false,
      message: "AI passage generation is temporarily unavailable. Please try again later.",
    });
  }
}

// ── Router ──

exports.handler = async (event) => {
  const path = (event.rawPath || "").replace(/\/+$/, "");
  const method = event.requestContext?.http?.method || "GET";

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        ...headers,
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
      },
      body: "",
    };
  }

  try {
    if (path === "/api/users" && method === "POST") return await handleRegister(event);
    if (path === "/api/users/confirm" && method === "POST") return await handleConfirmSignUp(event);
    if (path === "/api/users/resend-code" && method === "POST") return await handleResendCode(event);
    if (path === "/api/users/login" && method === "POST") return await handleLogin(event);
    if (path === "/api/users/me" && method === "GET") return await handleGetMe(event);
    if (path === "/api/users/me" && method === "DELETE") return await handleDeleteAccount(event);
    if (path === "/api/scores" && method === "POST") return await handleCreateScore(event);
    if (path === "/api/scores" && method === "GET") return await handleGetScores(event);
    if (path === "/api/analytics" && method === "GET") return await handleGetAnalytics(event);
    if (path === "/api/analytics/history" && method === "GET") return await handleGetAnalyticsHistory(event);
    if (path === "/api/coaching" && method === "GET") return await handleGetCoaching(event);
    if (path === "/api/drill/passage" && method === "POST") return await handleGeneratePassage(event);
    if (path === "/health" || path === "/api/health") {
      return response(200, { ok: true, env: process.env.ENV_NAME || "unknown" });
    }

    return response(404, { message: "Not found", path, method });
  } catch (err) {
    console.error("Unhandled error:", err);
    return response(500, { message: "Internal server error" });
  }
};
