/**
 * Regression tests for the API's authentication.
 *
 * These exist because the handler previously derived identity from
 * `JSON.parse(Buffer.from(token.split(".")[1], "base64url"))` with no signature
 * check, and no route carried an authorizer. Anyone could mint a payload and act
 * as any user. Every assertion below fails against that implementation.
 */

const mockDdbSend = jest.fn();
const mockVerify = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }), { virtual: true });
jest.mock(
  "@aws-sdk/lib-dynamodb",
  () => ({
    DynamoDBDocumentClient: { from: () => ({ send: mockDdbSend }) },
    PutCommand: class { constructor(i) { this.input = i; } },
    GetCommand: class { constructor(i) { this.input = i; } },
    QueryCommand: class { constructor(i) { this.input = i; } },
    UpdateCommand: class { constructor(i) { this.input = i; } },
    DeleteCommand: class { constructor(i) { this.input = i; } },
  }),
  { virtual: true }
);
jest.mock(
  "@aws-sdk/client-cognito-identity-provider",
  () => ({
    CognitoIdentityProviderClient: class { send() { return Promise.resolve({}); } },
    SignUpCommand: class {}, ConfirmSignUpCommand: class {},
    ResendConfirmationCodeCommand: class {}, InitiateAuthCommand: class {},
    AdminGetUserCommand: class {}, AdminDeleteUserCommand: class {},
  }),
  { virtual: true }
);
jest.mock(
  "@aws-sdk/client-bedrock-runtime",
  () => ({ BedrockRuntimeClient: class {}, ConverseCommand: class {} }),
  { virtual: true }
);
jest.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: { create: () => ({ verify: mockVerify }) },
}));

process.env.TABLE_NAME = "test-table";
process.env.COGNITO_USER_POOL_ID = "eu-central-1_test";
process.env.COGNITO_CLIENT_ID = "test-client";

const { handler } = require("../lambda/api/index.js");

const req = (path, method, { token, body } = {}) => ({
  rawPath: path,
  requestContext: { http: { method } },
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: body ? JSON.stringify(body) : undefined,
});

beforeEach(() => {
  mockDdbSend.mockReset();
  mockVerify.mockReset();
});

describe("token verification", () => {
  const protectedRoutes = [
    ["/api/users/me", "GET"],
    ["/api/analytics", "GET"],
    ["/api/coaching", "GET"],
    ["/api/drill/passage", "POST"],
  ];

  test.each(protectedRoutes)("%s %s rejects a forged token", async (path, method) => {
    mockVerify.mockRejectedValue(new Error("Invalid signature"));
    const res = await handler(req(path, method, { token: "forged.payload.sig" }));
    expect(res.statusCode).toBe(401);
    expect(mockDdbSend).not.toHaveBeenCalled();
  });

  test.each(protectedRoutes)("%s %s rejects a missing token", async (path, method) => {
    const res = await handler(req(path, method));
    expect(res.statusCode).toBe(401);
    expect(mockDdbSend).not.toHaveBeenCalled();
  });

  test("the raw JWT payload is never trusted without verification", async () => {
    // A syntactically valid JWT whose payload claims to be another user.
    const payload = Buffer.from(JSON.stringify({ sub: "victim", email: "v@x.com" })).toString("base64url");
    mockVerify.mockRejectedValue(new Error("Invalid signature"));
    const res = await handler(req("/api/analytics", "GET", { token: `h.${payload}.s` }));
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/scores", () => {
  test("ignores an identity supplied in the body", async () => {
    mockVerify.mockResolvedValue({ sub: "real-user", name: "Real", email: "r@x.com" });
    mockDdbSend.mockResolvedValue({});

    await handler(req("/api/scores", "POST", {
      token: "good",
      body: { user: "victim", userName: "Impersonated", score: 99 },
    }));

    const item = mockDdbSend.mock.calls[0][0].input.Item;
    expect(item.userId).toBe("real-user");
    expect(item.userName).toBe("Real");
    expect(item.pk).toBe("USER#real-user");
  });

  test("an unauthenticated submission is recorded as anonymous, not as the claimed user", async () => {
    mockDdbSend.mockResolvedValue({});
    await handler(req("/api/scores", "POST", { body: { user: "victim", score: 99 } }));

    const item = mockDdbSend.mock.calls[0][0].input.Item;
    expect(item.userId).toBe("anonymous");
    expect(item.pk).toBe("USER#anonymous");
  });

  test("drops an oversized analytics payload", async () => {
    mockVerify.mockResolvedValue({ sub: "u1", name: "U" });
    mockDdbSend.mockResolvedValue({});
    const huge = { blob: "x".repeat(100 * 1024) };

    await handler(req("/api/scores", "POST", { token: "good", body: { score: 1, analytics: huge } }));
    expect(mockDdbSend.mock.calls[0][0].input.Item.analytics).toBeUndefined();
  });
});

describe("GET /api/scores", () => {
  const rows = [
    { scoreId: "s1", userId: "user-a", userName: "A", score: 10, createdAt: "2026-01-01" },
    { scoreId: "s2", userId: "user-b", userName: "B", score: 20, createdAt: "2026-01-02" },
  ];

  test("never exposes user ids", async () => {
    mockDdbSend.mockResolvedValue({ Items: rows });
    const res = await handler(req("/api/scores", "GET"));
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body).toHaveLength(2);
    for (const row of body) expect(row).not.toHaveProperty("user");
    expect(res.body).not.toContain("user-a");
    expect(res.body).not.toContain("user-b");
  });

  test("flags the caller's own rows when a valid token is present", async () => {
    mockVerify.mockResolvedValue({ sub: "user-b" });
    mockDdbSend.mockResolvedValue({ Items: rows });
    const body = JSON.parse((await handler(req("/api/scores", "GET", { token: "good" }))).body);

    expect(body.find((r) => r._id === "s1").isMine).toBe(false);
    expect(body.find((r) => r._id === "s2").isMine).toBe(true);
  });

  test("flags nothing as mine for an anonymous caller", async () => {
    mockDdbSend.mockResolvedValue({ Items: rows });
    const body = JSON.parse((await handler(req("/api/scores", "GET"))).body);
    expect(body.every((r) => r.isMine === false)).toBe(true);
  });
});
