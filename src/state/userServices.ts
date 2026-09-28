import { api } from "./apiClient";
import { clearSession, readSession, writeSession } from "./session";

export const register = async (userData: {
  name: string;
  email: string;
  password: string;
}) => {
  const response = await api.post("/api/users/", userData);
  return response.data;
};

export const confirmSignUp = async (data: {
  email: string;
  password: string;
  code: string;
}) => {
  const response = await api.post("/api/users/confirm", data);
  if (response.data) {
    writeSession(response.data);
  }
  return response.data;
};

export const resendCode = async (data: { email: string }) => {
  const response = await api.post("/api/users/resend-code", data);
  return response.data;
};

export const login = async (userData: { email: string; password: string }) => {
  const response = await api.post("/api/users/login", userData);
  if (response.data) {
    writeSession(response.data);
  }
  return response.data;
};

export const logout = async () => {
  const session = readSession();
  // Locally first: signing out must not depend on the network succeeding.
  clearSession();
  if (!session?.refreshToken) return;
  try {
    await api.post("/api/users/logout", { refreshToken: session.refreshToken });
  } catch {
    // Best effort. The token expires on its own; nothing here is actionable.
  }
};

export const deleteAccount = async (password: string) => {
  const response = await api.delete("/api/users/me", { data: { password } });
  return response.data;
};
