import { api } from "./apiClient";

export const createScore = async (scoreData: any) => {
  // The API derives the player's id and display name from the bearer token the
  // client attaches; anything identity-shaped in the body is ignored.
  const response = await api.post("/api/scores/", scoreData);
  return response.data;
};

export const getScores = async () => {
  // The leaderboard is public. A token, when there is one, only lets the API mark
  // which rows are the caller's own, so a dead session costs the highlighting
  // rather than the whole board.
  const response = await api.get("/api/scores/", { allowSignedOut: true });
  return response.data;
};

export const getAnalyticsProfile = async () => {
  const response = await api.get("/api/analytics");
  return response.data;
};

export const getCoaching = async () => {
  const response = await api.get("/api/coaching");
  return response.data;
};

export const generateDrillPassage = async (refresh = false) => {
  const response = await api.post("/api/drill/passage", { refresh });
  return response.data;
};
