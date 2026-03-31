const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  InitiateAuthCommand,
  AdminGetUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const crypto = require("crypto");

const TABLE = process.env.TABLE_NAME;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const REGION = process.env.AWS_REGION;

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
    const signUpResult = await cognito.send(new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "name", Value: name },
        { Name: "email", Value: email },
      ],
    }));

    const sub = signUpResult.UserSub;

    await cognito.send(new AdminConfirmSignUpCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    }));

    const authResult = await cognito.send(new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));

    const idToken = authResult.AuthenticationResult.IdToken;

    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `USER#${sub}`,
        sk: "PROFILE",
        name,
        email,
        createdAt: new Date().toISOString(),
      },
    }));

    return response(201, { _id: sub, name, email, token: idToken });
  } catch (err) {
    const status = err.name === "UsernameExistsException" ? 400 : 500;
    return response(status, {
      message: err.name === "UsernameExistsException"
        ? "User already exists"
        : err.message,
    });
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

// ── Score routes ──

async function handleCreateScore(event) {
  const { user: userId, type, score, theme } = parseBody(event);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const item = {
    pk: userId ? `USER#${userId}` : "USER#anonymous",
    sk: `SCORE#${now}#${id}`,
    gsi1pk: "SCORE",
    gsi1sk: now,
    scoreId: id,
    userId: userId || "anonymous",
    type: type || "qwerty",
    score: score ?? 0,
    theme: theme ?? false,
    createdAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

  return response(201, {
    _id: id,
    user: item.userId,
    type: item.type,
    score: item.score,
    theme: item.theme,
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
    type: item.type,
    score: item.score,
    theme: item.theme,
    createdAt: item.createdAt,
  }));

  return response(200, scores);
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
    if (path === "/api/users/login" && method === "POST") return await handleLogin(event);
    if (path === "/api/users/me" && method === "GET") return await handleGetMe(event);
    if (path === "/api/scores" && method === "POST") return await handleCreateScore(event);
    if (path === "/api/scores" && method === "GET") return await handleGetScores();
    if (path === "/health" || path === "/api/health") {
      return response(200, { ok: true, env: process.env.ENV_NAME || "unknown" });
    }

    return response(404, { message: "Not found", path, method });
  } catch (err) {
    console.error("Unhandled error:", err);
    return response(500, { message: "Internal server error" });
  }
};
