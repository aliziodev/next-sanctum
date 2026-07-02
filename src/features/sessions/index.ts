import { ConfigError } from "../../core"
import type { ResolvedSanctumConfig, SanctumClient } from "../../core"

/**
 * One row of Laravel's `sessions` table (`SESSION_DRIVER=database`), as exposed by
 * the app's session endpoints. `last_active_at` is ISO-8601 (converted from the
 * table's unix `last_activity` on the Laravel side).
 */
export interface DeviceSession {
  /** Session ID (primary key of the `sessions` table). */
  id: string
  ip_address: string | null
  user_agent: string | null
  /** True for the session making this request. */
  is_current: boolean
  last_active_at: string
}

export interface LogoutOtherSessionsPayload {
  /**
   * Current password — for endpoints that validate it in the request body.
   * Omit when the route is protected by `password.confirm` middleware instead.
   */
  password?: string
}

export interface SessionsApi {
  /** List the user's sessions (`GET /api/sessions`). */
  list<TList = DeviceSession[]>(): Promise<TList>
  /** Log out every other session (`DELETE /api/sessions/others`). */
  logoutOthers(payload?: LogoutOtherSessionsPayload): Promise<void>
  /** Log out a single session by ID (`DELETE /api/sessions/{id}`). */
  logout(id: string): Promise<void>
}

/**
 * Device sessions (opt-in via `features.deviceSessions`). Fortify ships no sessions
 * API — the Laravel app must expose these endpoints itself over the framework's
 * `sessions` table (see the README for the expected contract).
 */
export function createSessionsApi(
  client: SanctumClient,
  config: ResolvedSanctumConfig,
): SessionsApi {
  const ep = config.endpoints.sessions

  function ensureEnabled(): void {
    if (!config.features.deviceSessions) {
      throw new ConfigError(
        'The "deviceSessions" feature is disabled in config. Enable it with `features.deviceSessions: true` (requires session endpoints on the Laravel side).',
      )
    }
  }

  return {
    async list<TList = DeviceSession[]>(): Promise<TList> {
      ensureEnabled()
      return client.request<TList>(ep.list, { method: "GET" })
    },
    async logoutOthers(payload) {
      ensureEnabled()
      await client.raw(ep.logoutOthers, {
        method: "DELETE",
        json: payload ?? {},
      })
    },
    async logout(id) {
      ensureEnabled()
      await client.raw(`${ep.logout}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
    },
  }
}
