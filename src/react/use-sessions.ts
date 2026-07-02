import { useSanctumContext } from "./context"
import type { SessionsApi } from "../features/sessions"

/**
 * Device sessions (opt-in `features.deviceSessions`): list the user's sessions and
 * revoke one or all others. Requires the session endpoints on the Laravel side —
 * see the README for the expected contract.
 */
export function useSessions(): SessionsApi {
  return useSanctumContext().sessions
}
