import { useMemo, useSyncExternalStore } from "react";
import {
  parseSession,
  sessionSnapshot,
  subscribeToSession,
  type Session,
} from "../state/session";

/**
 * Reactive view of the stored session.
 *
 * `useSyncExternalStore` rather than useState + useEffect: a request can end the
 * session at any moment, including between a component's first render and its
 * effects, and that change must not be missed.
 */
export function useSession(): Session | null {
  const raw = useSyncExternalStore(subscribeToSession, sessionSnapshot);
  return useMemo(() => parseSession(raw), [raw]);
}
