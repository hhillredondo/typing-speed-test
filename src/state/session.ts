/** The signed-in user, as persisted in localStorage. */
export interface Session {
  _id: string;
  name: string;
  email: string;
  /** Cognito ID token. Valid for one hour; renewed with `refreshToken`. */
  token: string;
  /** Absent in sessions stored before the app captured refresh tokens. */
  refreshToken?: string;
}

const STORAGE_KEY = "user";
const CHANGED_EVENT = "session-changed";

/**
 * The stored session as a raw string - a value that only changes when the session
 * does, which is what `useSyncExternalStore` needs to avoid re-rendering forever.
 */
export function sessionSnapshot(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed || !parsed.token || !parsed._id) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export function readSession(): Session | null {
  return parseSession(sessionSnapshot());
}

export function writeSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/**
 * Expiry of an ID token, in epoch milliseconds, or null if it cannot be read.
 *
 * The payload is decoded, not verified: it only decides when to renew. Every
 * request still has its signature checked by the API.
 */
export function tokenExpiresAt(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const exp = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when the token is still good for `skewSeconds` of round trip. */
export function isTokenFresh(token: string, skewSeconds = 60): boolean {
  const expiresAt = tokenExpiresAt(token);
  if (expiresAt === null) return false;
  return expiresAt - skewSeconds * 1000 > Date.now();
}

/** Fires on login, logout, renewal, and on changes made in another tab. */
export function subscribeToSession(listener: () => void): () => void {
  // Filtered by key: the theme lives in localStorage too, and toggling it in
  // another tab must not churn every consumer of the session.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
