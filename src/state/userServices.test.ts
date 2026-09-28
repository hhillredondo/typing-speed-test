import axios, { type AxiosAdapter, type AxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./apiClient";
import { readSession, writeSession } from "./session";
import { logout } from "./userServices";

const calls: AxiosRequestConfig[] = [];
let fail = false;

const adapter: AxiosAdapter = async (config) => {
  calls.push(config);
  if (fail) throw new axios.AxiosError("Network Error", "ERR_NETWORK");
  return { data: { message: "Logged out" }, status: 200, statusText: "OK", headers: {}, config } as never;
};

const session = {
  _id: "u1",
  name: "Hugo",
  email: "h@example.com",
  token: "header.payload.sig",
  refreshToken: "refresh-token",
};

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  fail = false;
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
});

describe("logout", () => {
  it("revokes the refresh token server-side", async () => {
    writeSession(session);

    await logout();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/users/logout");
    expect(calls[0].data).toContain("refresh-token");
    expect(readSession()).toBeNull();
  });

  it("signs out locally even when the revoke cannot be delivered", async () => {
    writeSession(session);
    fail = true;

    await expect(logout()).resolves.toBeUndefined();
    expect(readSession()).toBeNull();
  });

  it("makes no request for a session that has no refresh token", async () => {
    writeSession({ ...session, refreshToken: undefined });

    await logout();

    expect(calls).toHaveLength(0);
    expect(readSession()).toBeNull();
  });
});
