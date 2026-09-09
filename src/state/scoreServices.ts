import axios from "axios";
import { baseUrl } from "../utils/constants";

export const createScore = async (scoreData: any) => {
  // The API derives the player's id and display name from this token; anything
  // identity-shaped in the body is ignored.
  const user = localStorage.getItem("user");
  const token = user ? JSON.parse(user).token : null;
  const response = await axios.post(baseUrl + "/api/scores/", scoreData, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return response.data;
};

export const getScores = async () => {
  // Sent when signed in so the API can mark which rows are the caller's own.
  // The leaderboard itself is public and works fine without a token.
  const user = localStorage.getItem("user");
  const token = user ? JSON.parse(user).token : null;
  const response = await axios.get(baseUrl + "/api/scores/", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  return response.data;
};

export const getAnalyticsProfile = async () => {
  const user = localStorage.getItem("user");
  const token = user ? JSON.parse(user).token : null;
  const response = await axios.get(baseUrl + "/api/analytics", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getAnalyticsHistory = async () => {
  const user = localStorage.getItem("user");
  const token = user ? JSON.parse(user).token : null;
  const response = await axios.get(baseUrl + "/api/analytics/history", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getCoaching = async () => {
  const user = localStorage.getItem("user");
  const token = user ? JSON.parse(user).token : null;
  const response = await axios.get(baseUrl + "/api/coaching", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const generateDrillPassage = async (refresh = false) => {
  const user = localStorage.getItem("user");
  const token = user ? JSON.parse(user).token : null;
  const response = await axios.post(
    baseUrl + "/api/drill/passage",
    { refresh },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};
