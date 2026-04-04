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
const crypto = require("crypto");

const TABLE = process.env.TABLE_NAME;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
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

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString());
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
    const claims = decodeJwtPayload(idToken);

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
    const claims = decodeJwtPayload(idToken);

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
  const authHeader = event.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return response(401, { message: "Not authorized, no token" });
  }

  try {
    const claims = decodeJwtPayload(authHeader.split(" ")[1]);
    return response(200, {
      id: claims.sub,
      name: claims.name || "",
      email: claims.email,
    });
  } catch {
    return response(401, { message: "Not authorized" });
  }
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

  let claims;
  try {
    claims = decodeJwtPayload(authHeader.split(" ")[1]);
  } catch {
    return response(401, { message: "Not authorized" });
  }

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
  const userId = body.user || "anonymous";
  const score = body.score ?? 0;
  const userName = body.userName || "Anonymous";
  const accuracy = body.accuracy ?? null;
  const mistakes = body.mistakes ?? null;
  const analytics = body.analytics || null;

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

async function handleGetScores() {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: "gsi1",
    KeyConditionExpression: "gsi1pk = :pk",
    ExpressionAttributeValues: { ":pk": "SCORE" },
    ScanIndexForward: false,
    Limit: 500,
  }));

  const scores = (result.Items || []).map((item) => ({
    _id: item.scoreId,
    user: item.userId,
    userName: item.userName || "Anonymous",
    score: item.score,
    accuracy: item.accuracy ?? null,
    createdAt: item.createdAt,
  }));

  return response(200, scores);
}

// ── Analytics ──

const RECENT_HISTORY_SIZE = 50;

async function updateAnalyticsProfile(userId, score, accuracy, mistakes, analytics) {
  const pk = `USER#${userId}`;
  const sk = "ANALYTICS";

  const existing = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { pk, sk },
  }));

  const profile = existing.Item || {
    pk,
    sk,
    totalTests: 0,
    rollingKeyStats: {},
    rollingBigramStats: {},
    rollingBackspaceStats: {
      totalBackspaces: 0, wordsWithBackspace: 0,
      wordsRecovered: 0, wordsFailed: 0,
      totalConsecutiveRuns: 0, totalConsecutiveLength: 0,
    },
    recentWpm: [],
    recentAccuracy: [],
  };

  if (!profile.rollingBackspaceStats) {
    profile.rollingBackspaceStats = {
      totalBackspaces: 0, wordsWithBackspace: 0,
      wordsRecovered: 0, wordsFailed: 0,
      totalConsecutiveRuns: 0, totalConsecutiveLength: 0,
    };
  }

  profile.totalTests += 1;

  if (analytics.keyStats) {
    for (const [key, stats] of Object.entries(analytics.keyStats)) {
      if (!profile.rollingKeyStats[key]) {
        profile.rollingKeyStats[key] = { correct: 0, errors: 0, totalLatencyMs: 0, count: 0 };
      }
      const r = profile.rollingKeyStats[key];
      r.correct += stats.correct;
      r.errors += stats.errors;
      r.totalLatencyMs += stats.avgLatencyMs * (stats.correct + stats.errors);
      r.count += stats.correct + stats.errors;
    }
  }

  if (analytics.bigramStats) {
    for (const bg of analytics.bigramStats) {
      if (!profile.rollingBigramStats[bg.bigram]) {
        profile.rollingBigramStats[bg.bigram] = { totalLatencyMs: 0, count: 0 };
      }
      const r = profile.rollingBigramStats[bg.bigram];
      r.totalLatencyMs += bg.avgLatencyMs * bg.count;
      r.count += bg.count;
    }
  }

  if (analytics.backspaceStats) {
    const bs = analytics.backspaceStats;
    const r = profile.rollingBackspaceStats;
    r.totalBackspaces += bs.totalBackspaces;
    r.wordsWithBackspace += bs.wordsWithBackspace;
    r.wordsRecovered += bs.wordsRecovered;
    r.wordsFailed += bs.wordsFailed;
    r.totalConsecutiveRuns += bs.consecutiveRuns;
    r.totalConsecutiveLength += bs.totalConsecutiveLength;
  }

  profile.recentWpm = [...profile.recentWpm, score].slice(-RECENT_HISTORY_SIZE);
  profile.recentAccuracy = [...profile.recentAccuracy, accuracy ?? 100].slice(-RECENT_HISTORY_SIZE);

  const weakestKeys = computeWeakestKeys(profile.rollingKeyStats);
  const slowestBigrams = computeSlowestBigrams(profile.rollingBigramStats);
  const fatigueArchetype = analytics.windows
    ? classifyFatigueArchetype(analytics.windows)
    : "unknown";
  const wpmTrend = computeWpmTrend(profile.recentWpm);

  profile.weakestKeys = weakestKeys;
  profile.slowestBigrams = slowestBigrams;
  profile.fatigueArchetype = fatigueArchetype;
  profile.wpmTrend = wpmTrend;
  profile.lastWindows = analytics.windows || [];
  profile.updatedAt = new Date().toISOString();

  await ddb.send(new PutCommand({ TableName: TABLE, Item: profile }));
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

async function handleGetAnalytics(event) {
  const authHeader = event.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return response(401, { message: "Not authorized, no token" });
  }

  try {
    const claims = decodeJwtPayload(authHeader.split(" ")[1]);
    const userId = claims.sub;

    const result = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { pk: `USER#${userId}`, sk: "ANALYTICS" },
    }));

    if (!result.Item) {
      return response(200, { totalTests: 0 });
    }

    const { pk, sk, ...profile } = result.Item;
    return response(200, profile);
  } catch {
    return response(401, { message: "Not authorized" });
  }
}

async function handleGetAnalyticsHistory(event) {
  const authHeader = event.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return response(401, { message: "Not authorized, no token" });
  }

  try {
    const claims = decodeJwtPayload(authHeader.split(" ")[1]);
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
    if (path === "/api/scores" && method === "GET") return await handleGetScores();
    if (path === "/api/analytics" && method === "GET") return await handleGetAnalytics(event);
    if (path === "/api/analytics/history" && method === "GET") return await handleGetAnalyticsHistory(event);
    if (path === "/health" || path === "/api/health") {
      return response(200, { ok: true, env: process.env.ENV_NAME || "unknown" });
    }

    return response(404, { message: "Not found", path, method });
  } catch (err) {
    console.error("Unhandled error:", err);
    return response(500, { message: "Internal server error" });
  }
};
