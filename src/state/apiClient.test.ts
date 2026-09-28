import axios, {
  type AxiosAdapter,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { beforeEach, describe, expect, it } from "vitest";
import { api, isSessionExpired } from "./apiClient";
import { readSession, writeSession, type Session } from "./session";

const token = (secondsFromNow: number) => {
  const part = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({
    sub: "u1",
    exp: Math.floor(Date.now() / 1000) + secondsFromNow,
  })}.sig`;
};

const FRESH = token(3600);
const SPENT = token(-300);

const session = (over: Partial<Session> = {}): Session => ({
  _id: "u1",
  name: "Hugo",
  email: "h@example.com",
  token: SPENT,
  refreshToken: "refresh-token",
  ...over,
});

const renewed = (newToken = FRESH) => ({
  data: { _id: "u1", name: "Hugo", email: "h@example.com", token: newToken },
});

/** What a stubbed endpoint answers: a status, a body, or a thrown transport error. */
type Reply = () => Promise<{ status?: number; data?: unknown }>;

const calls: AxiosRequestConfig[] = [];
let replies: Record<string, Reply>;

const adapter: AxiosAdapter = async (config) => {
  calls.push(config);
  // Renewal goes through plain axios with an absolute URL; everything else
  // through the instance with a relative one.
  const path = (config.url || "").replace(/^https?:\/\/[^/]+/, "");
  const reply = replies[path];
  if (!reply) throw new Error(`no stub for ${path}`);

  const { status = 200, data = {} } = await reply();
  const response = { data, status, statusText: "", headers: {}, config } as AxiosResponse;
  if (status >= 400) {
    throw new axios.AxiosError(
      `Request failed with status code ${status}`,
      String(status),
      config as never,
      null,
      response
    );
  }
  return response;
};

const networkError = (): never => {
  throw new axios.AxiosError("Network Error", "ERR_NETWORK");
};

const authHeaderOf = (call: AxiosRequestConfig) =>
  new Headers(call.headers as Record<string, string>).get("authorization");

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  replies = {};
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
});

describe("token attachment", () => {
  it("sends nothing when no one is signed in", async () => {
    replies["/api/scores/"] = async () => ({ data: [] });
    await api.get("/api/scores/");
    expect(authHeaderOf(calls[0])).toBeNull();
  });

  it("sends a token that is still good without renewing it", async () => {
    writeSession(session({ token: FRESH }));
    replies["/api/scores/"] = async () => ({ data: [] });

    await api.get("/api/scores/");

    expect(authHeaderOf(calls[0])).toBe(`Bearer ${FRESH}`);
    expect(calls).toHaveLength(1);
  });

  it("renews a spent token, stores the new one, and sends it", async () => {
    writeSession(session());
    replies["/api/users/refresh"] = async () => renewed();
    replies["/api/analytics"] = async () => ({ data: { totalTests: 3 } });

    await api.get("/api/analytics");

    expect(authHeaderOf(calls.at(-1)!)).toBe(`Bearer ${FRESH}`);
    expect(readSession()!.token).toBe(FRESH);
    // The refresh token is not rotated, so it has to survive the exchange.
    expect(readSession()!.refreshToken).toBe("refresh-token");
  });

  it("renews once for concurrent requests", async () => {
    writeSession(session());
    let refreshes = 0;
    replies["/api/users/refresh"] = async () => {
      refreshes += 1;
      return renewed();
    };
    replies["/api/analytics"] = async () => ({ data: { totalTests: 3 } });
    replies["/api/coaching"] = async () => ({ data: { available: false } });

    await Promise.all([api.get("/api/analytics"), api.get("/api/coaching")]);

    expect(refreshes).toBe(1);
  });
});

describe("when renewal fails", () => {
  it("keeps the session on a network error, so a blip costs no credentials", async () => {
    writeSession(session());
    replies["/api/users/refresh"] = async () => networkError();

    await expect(api.get("/api/analytics")).rejects.toThrow();
    expect(readSession()).not.toBeNull();
    expect(readSession()!.refreshToken).toBe("refresh-token");
  });

  it("keeps the session when the refresh endpoint is unavailable", async () => {
    writeSession(session());
    replies["/api/users/refresh"] = async () => ({ status: 503 });

    await expect(api.get("/api/analytics")).rejects.toThrow();
    expect(readSession()).not.toBeNull();
  });

  it("clears the session only when the refresh token is refused", async () => {
    writeSession(session());
    replies["/api/users/refresh"] = async () => ({ status: 401 });

    await expect(api.get("/api/analytics")).rejects.toSatisfy(isSessionExpired);
    expect(readSession()).toBeNull();
  });

  it("clears a session stored before refresh tokens existed", async () => {
    writeSession(session({ refreshToken: undefined }));

    await expect(api.get("/api/analytics")).rejects.toSatisfy(isSessionExpired);
    expect(readSession()).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("requests that work signed out", () => {
  it("still fetches the leaderboard when the session turns out to be dead", async () => {
    writeSession(session({ refreshToken: undefined }));
    replies["/api/scores/"] = async () => ({ data: [{ _id: "s1", score: 10 }] });

    const rows = await api
      .get("/api/scores/", { allowSignedOut: true })
      .then((r) => r.data);

    expect(rows).toHaveLength(1);
    expect(authHeaderOf(calls[0])).toBeNull();
    expect(readSession()).toBeNull();
  });

  it("does not submit a score anonymously when the session is dead", async () => {
    writeSession(session({ refreshToken: undefined }));
    replies["/api/scores/"] = async () => ({ data: { _id: "s1" } });

    await expect(api.post("/api/scores/", { score: 40 })).rejects.toSatisfy(isSessionExpired);
    expect(calls).toHaveLength(0);
  });
});

describe("a 401 on a token that looked fresh", () => {
  it("renews and retries once", async () => {
    writeSession(session({ token: FRESH }));
    let attempts = 0;
    replies["/api/analytics"] = async () => {
      attempts += 1;
      return attempts === 1 ? { status: 401 } : { data: { totalTests: 3 } };
    };
    replies["/api/users/refresh"] = async () => renewed(token(7200));

    const data = await api.get("/api/analytics").then((r) => r.data);

    expect(data).toEqual({ totalTests: 3 });
    expect(attempts).toBe(2);
  });

  it("ends the session when the renewed token is refused too", async () => {
    writeSession(session({ token: FRESH }));
    replies["/api/analytics"] = async () => ({ status: 401 });
    replies["/api/users/refresh"] = async () => renewed(token(7200));

    await expect(api.get("/api/analytics")).rejects.toSatisfy(isSessionExpired);
    expect(readSession()).toBeNull();
  });
});

describe("a different account signing in mid-renewal", () => {
  it("never writes the first account's token onto the second", async () => {
    writeSession(session());
    let releaseRefresh: () => void = () => {};
    const refreshStarted = new Promise<void>((markStarted) => {
      replies["/api/users/refresh"] = () =>
        new Promise((resolve) => {
          markStarted();
          releaseRefresh = () => resolve(renewed());
        });
    });
    replies["/api/analytics"] = async () => ({ data: { totalTests: 3 } });

    const inFlight = api.get("/api/analytics").catch(() => undefined);
    await refreshStarted;

    // User B signs in while A's renewal is still open.
    const b = session({ _id: "u2", name: "Other", email: "o@example.com", token: token(7200) });
    writeSession(b);
    releaseRefresh();
    await inFlight;

    expect(readSession()).toEqual(b);
  });
});
