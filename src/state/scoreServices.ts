import axios from "axios";
import { baseUrl } from "../utils/constants";

export const createScore = async (scoreData: any) => {
  const response = await axios.post(baseUrl + "/api/scores/", scoreData);

  return response.data;
};

export const getScores = async () => {
  const response = await axios.get(baseUrl + "/api/scores/");

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
