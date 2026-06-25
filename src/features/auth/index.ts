import { ConfigError, SanctumError } from "../../core"
import type {
  LoginCredentials,
  LoginResult,
  ResolvedSanctumConfig,
  SanctumClient,
  SanctumEventEmitter,
  SanctumUser,
} from "../../core"

export interface AuthApiDeps<TUser = SanctumUser> {
  emitter?: SanctumEventEmitter<TUser>
  /** Store the token (token mode). */
  setToken?: (token: string) => Promise<void> | void
  /** Clear the token on logout (token mode). */
  clearToken?: () => Promise<void> | void
}

export interface AuthApi<TUser = SanctumUser> {
  login(credentials: LoginCredentials): Promise<LoginResult<TUser>>
  logout(): Promise<void>
  refreshIdentity(): Promise<TUser | null>
}

interface LoginResponseBody {
  two_factor?: boolean
  token?: string
}

/**
 * Core auth API (framework-agnostic). The React provider wraps it to
 * manage state. Login detects `two_factor` BEFORE fetching the user
 * so consumers cannot forget to handle 2FA (discriminated result).
 */
export function createAuthApi<TUser = SanctumUser>(
  client: SanctumClient,
  config: ResolvedSanctumConfig,
  deps: AuthApiDeps<TUser> = {},
): AuthApi<TUser> {
  const { emitter } = deps

  async function refreshIdentity(): Promise<TUser | null> {
    try {
      const user = await client.request<TUser>(config.endpoints.user, {
        method: "GET",
      })
      const resolved = user ?? null
      emitter?.emit("refresh", { user: resolved })
      return resolved
    } catch (error) {
      if (error instanceof SanctumError && error.kind === "unauthorized") {
        emitter?.emit("refresh", { user: null })
        return null
      }
      throw error
    }
  }

  async function login(
    credentials: LoginCredentials,
  ): Promise<LoginResult<TUser>> {
    const data = await client.request<LoginResponseBody | null>(
      config.endpoints.login,
      { method: "POST", json: credentials },
    )

    if (data?.two_factor) {
      // Token mode + 2FA is not completable via the standard Fortify flow: the
      // `/two-factor-challenge` endpoint establishes a session and returns no token.
      // Fail loud instead of leaving the user silently unauthenticated.
      if (config.mode === "token") {
        throw new ConfigError(
          "Two-factor authentication during login is only supported in cookie mode. " +
            "In token mode, mint the token from a 2FA-aware endpoint.",
        )
      }
      emitter?.emit("two-factor-required", {})
      return { status: "two-factor-required" }
    }

    if (config.mode === "token" && data?.token) {
      await deps.setToken?.(data.token)
    }

    const user = await refreshIdentity()
    if (!user) {
      throw new SanctumError(
        "Login succeeded but failed to fetch the user data. Check the user endpoint & configuration.",
        { kind: "unknown" },
      )
    }
    emitter?.emit("login", { user })
    return { status: "authenticated", user }
  }

  async function logout(): Promise<void> {
    try {
      await client.raw(config.endpoints.logout, { method: "POST" })
    } finally {
      if (config.mode === "token") await deps.clearToken?.()
      emitter?.emit("logout", {})
    }
  }

  return { login, logout, refreshIdentity }
}
