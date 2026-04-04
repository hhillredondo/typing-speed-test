import axios from "axios";
import { baseUrl } from "../utils/constants";

export const register = async (userData: {
  name: string;
  email: string;
  password: string;
}) => {
  const response = await axios.post(baseUrl + "/api/users/", userData);
  return response.data;
};

export const confirmSignUp = async (data: {
  email: string;
  password: string;
  code: string;
}) => {
  const response = await axios.post(baseUrl + "/api/users/confirm", data);
  if (response.data) {
    localStorage.setItem("user", JSON.stringify(response.data));
  }
  return response.data;
};

export const resendCode = async (data: { email: string }) => {
  const response = await axios.post(baseUrl + "/api/users/resend-code", data);
  return response.data;
};

export const login = async (userData: {
  email: string;
  password: string;
}) => {
  const response = await axios.post(baseUrl + "/api/users/login", userData);
  if (response.data) {
    localStorage.setItem("user", JSON.stringify(response.data));
  }
  return response.data;
};

export const logout = async () => {
  localStorage.setItem("user", "");
};

export const deleteAccount = async (password: string) => {
  const raw = localStorage.getItem("user");
  if (!raw) throw new Error("Not logged in");
  const user = JSON.parse(raw) as { token?: string };
  if (!user.token) throw new Error("Not logged in");

  const response = await axios.delete(`${baseUrl}/api/users/me`, {
    data: { password },
    headers: { Authorization: `Bearer ${user.token}` },
  });
  return response.data;
};
