import axios, { type InternalAxiosRequestConfig } from "axios";
import { baseUrl } from "../utils/constants";
import { clearSession, isTokenFresh, readSession, writeSession, type Session } from "./session";

declare module "axios" {
  export interface AxiosRequestConfig {
    /**
     * Send this request even when the stored session turns out to be dead. For
     * endpoints that mean the same thing signed out - the public leaderboard, not
     * score submission, where an anonymous row is worse than no row.
     */
    allowSignedOut?: boolean;
    /** Set by the response interceptor; one renewal attempt per request. */
    retriedAfterRenewal?: boolean;
  }
}

/** Thrown when the stored session is over. The session has been cleared. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Your session expired. Log in again.");
    this.name = "SessionExpiredError";
  }
}

export const isSessionExpired = (err: unknown) => err instanceof SessionExpiredError;

/** Clears the stored session and returns the error to throw for it. */
function endSession(): SessionExpiredError {
  clearSession();
  return new SessionExpiredError();
}

/** Only an outright refusal proves the session is over; a 5xx or an outage does not. */
const isRefusal = (err: unknown) =>
  axios.isAxiosError(err) && err.response?.status === 401;

// Renewal is single-flight, keyed by user: the analytics page fires several
// requests at once and they must share one exchange, but a renewal started for
// one account must never hand its token to the next one to sign in.
let renewal: { sessionId: string; promise: Promise<string> } | null = null;

async function renew(session: Session): Promise<string> {
  // Plain axios on purpose: the interceptors below must not recurse into renewal.
  const { data } = await axios.post(baseUrl + "/api/users/refresh", {
    refreshToken: session.refreshToken,
  });

  const current = readSession();
  // Another account may have signed in while this was in flight. Writing the
  // renewed token onto its record would hand that user this one's identity.
  if (!current) throw new SessionExpiredError();
  if (current._id !== session._id) return current.token;

  writeSession({ ...current, name: data.name, email: data.email, token: data.token });
  return data.token;
}

function renewOnce(session: Session): Promise<string> {
  if (renewal?.sessionId !== session._id) {
    const promise = renew(session)
      .catch((err) => {
        // A refused refresh token is a dead session. A network blip or a 503 is
        // not, and must not destroy a credential that is still good for weeks.
        throw isRefusal(err) ? endSession() : err;
      })
      .finally(() => {
        if (renewal?.promise === promise) renewal = null;
      });
    renewal = { sessionId: session._id, promise };
  }
  return renewal.promise;
}

/** The ID token to send, renewed if it is spent. Null when nobody is signed in. */
async function idToken(): Promise<string | null> {
  const session = readSession();
  if (!session) return null;
  if (isTokenFresh(session.token)) return session.token;
  // Stored before refresh support existed, so it cannot be renewed.
  if (!session.refreshToken) throw endSession();
  return renewOnce(session);
}

export const api = axios.create({ baseURL: baseUrl });

api.interceptors.request.use(async (config) => {
  try {
    const token = await idToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch (err) {
    if (!config.allowSignedOut || !isSessionExpired(err)) throw err;
    // The session is gone but this request still means something without it.
  }
  return config;
});

// A 401 on a token that looked fresh means the API rejected it for a reason the
// client cannot see - a replaced user pool, a revoked session.
api.interceptors.response.use(undefined, async (error) => {
  const config = error.config as InternalAxiosRequestConfig | undefined;
  if (error.response?.status !== 401 || !config) throw error;

  // The retry carried a freshly renewed token and was still refused, so no token
  // this client can obtain will work.
  if (config.retriedAfterRenewal) throw endSession();

  const session = readSession();
  if (!session?.refreshToken) throw endSession();

  config.retriedAfterRenewal = true;
  await renewOnce(session);
  // The retry goes back through the request interceptor, which attaches the
  // token now in storage.
  return api.request(config);
});
