import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  isTokenFresh,
  readSession,
  subscribeToSession,
  tokenExpiresAt,
  writeSession,
} from "./session";

/** A JWT with the given `exp`. Unsigned: only the payload is read here. */
const tokenExpiringAt = (epochSeconds: number) => {
  const part = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ sub: "u1", exp: epochSeconds })}.sig`;
};

describe("tokenExpiresAt", () => {
  it("reads exp as epoch milliseconds", () => {
    expect(tokenExpiresAt(tokenExpiringAt(1_700_000_000))).toBe(1_700_000_000_000);
  });

  it("returns null for a token it cannot read", () => {
    expect(tokenExpiresAt("not-a-jwt")).toBeNull();
    expect(tokenExpiresAt("header.%%%.sig")).toBeNull();
    const noExp = Buffer.from(JSON.stringify({ sub: "u1" })).toString("base64url");
    expect(tokenExpiresAt(`header.${noExp}.sig`)).toBeNull();
  });
});

describe("isTokenFresh", () => {
  const inSeconds = (n: number) => Math.floor(Date.now() / 1000) + n;

  it("accepts a token with plenty of life left", () => {
    expect(isTokenFresh(tokenExpiringAt(inSeconds(3600)))).toBe(true);
  });

  it("rejects an expired token", () => {
    expect(isTokenFresh(tokenExpiringAt(inSeconds(-300)))).toBe(false);
  });

  it("rejects a token expiring inside the skew window, so it is renewed early", () => {
    expect(isTokenFresh(tokenExpiringAt(inSeconds(30)))).toBe(false);
  });

  it("rejects a token whose expiry cannot be read, rather than assuming it is good", () => {
    expect(isTokenFresh("not-a-jwt")).toBe(false);
  });
});

describe("stored session", () => {
  beforeEach(() => localStorage.clear());

  const valid = {
    _id: "u1",
    name: "Hugo",
    email: "h@example.com",
    token: "header.payload.sig",
    refreshToken: "refresh-token",
  };

  it("round-trips a session", () => {
    writeSession(valid);
    expect(readSession()).toEqual(valid);
  });

  it("reads nothing when nobody is signed in", () => {
    expect(readSession()).toBeNull();
  });

  it('treats the empty string left by the old logout as signed out', () => {
    localStorage.setItem("user", "");
    expect(readSession()).toBeNull();
  });

  it("treats malformed or half-written records as signed out", () => {
    localStorage.setItem("user", "{not json");
    expect(readSession()).toBeNull();
    localStorage.setItem("user", JSON.stringify({ name: "Hugo" }));
    expect(readSession()).toBeNull();
  });

  it("clearSession removes the record outright", () => {
    writeSession(valid);
    clearSession();
    expect(localStorage.getItem("user")).toBeNull();
  });
});

describe("subscribeToSession", () => {
  beforeEach(() => localStorage.clear());

  it("notifies on local writes and clears", () => {
    const seen = vi.fn();
    const unsubscribe = subscribeToSession(seen);

    writeSession({ _id: "u1", name: "H", email: "h@x.com", token: "a.b.c" });
    clearSession();
    expect(seen).toHaveBeenCalledTimes(2);

    unsubscribe();
    writeSession({ _id: "u1", name: "H", email: "h@x.com", token: "a.b.c" });
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("ignores another tab writing an unrelated key", () => {
    const seen = vi.fn();
    const unsubscribe = subscribeToSession(seen);

    window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "dark" }));
    expect(seen).not.toHaveBeenCalled();

    window.dispatchEvent(new StorageEvent("storage", { key: "user", newValue: "{}" }));
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
