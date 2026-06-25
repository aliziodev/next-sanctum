/**
 * Public & internal type surface of next-sanctum.
 * TypeScript-first, generic User model, no public `any`.
 */
import type { SanctumError } from "./errors"

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

/** Authentication mode. `cookie` = CSRF/SPA (default), `token` = Bearer. */
export type AuthMode = "cookie" | "token"

/** 0 silent · 1 error · 2 warn · 3 info (default) · 4 debug · 5 verbose. */
export type LogLevel = 0 | 1 | 2 | 3 | 4 | 5

/** Generic user shape; consumers cast it via the generic on the client/hook. */
export type SanctumUser = Record<string, unknown>

// ── Endpoints ────────────────────────────────────────────────────────────────

export interface TwoFactorEndpoints {
  challenge: string
  enable: string
  confirm: string
  disable: string
  qrCode: string
  secretKey: string
  recoveryCodes: string
}

export interface PasskeyEndpoints {
  loginOptions: string
  login: string
  confirmOptions: string
  confirm: string
  registerOptions: string
  register: string
  /** Base path; the passkey id is appended (`${delete}/${id}`). */
  delete: string
}

export interface SessionEndpoints {
  list: string
  logoutOthers: string
  logout: string
}

export interface SanctumEndpoints {
  csrf: string
  login: string
  logout: string
  user: string
  register: string
  forgotPassword: string
  resetPassword: string
  emailVerificationNotification: string
  confirmPassword: string
  confirmedPasswordStatus: string
  profileInformation: string
  updatePassword: string
  twoFactor: TwoFactorEndpoints
  passkeys: PasskeyEndpoints
  sessions: SessionEndpoints
}

// ── Feature flags (mirror of Fortify features) ───────────────────────────────

export interface TwoFactorFeature {
  /** Require a code confirmation step after enabling (default true). */
  confirm?: boolean
  /** Require password confirmation before managing 2FA (default true). */
  confirmPassword?: boolean
}

export interface PasskeysFeature {
  confirmPassword?: boolean
}

export interface FeatureFlags {
  registration?: boolean
  resetPasswords?: boolean
  emailVerification?: boolean
  updateProfileInformation?: boolean
  updatePasswords?: boolean
  twoFactorAuthentication?: boolean | TwoFactorFeature
  passkeys?: boolean | PasskeysFeature
  /** v1.1 — not yet implemented. */
  deviceSessions?: boolean
}

// ── Sub-config ───────────────────────────────────────────────────────────────

export interface CsrfConfig {
  cookie: string
  header: string
}

export interface RedirectConfig {
  onLogin: string
  onLogout: string
  onAuthOnly: string
  onGuestOnly: string
  keepRequestedRoute: boolean
}

// ── Events & interceptors ────────────────────────────────────────────────────

export interface SanctumEventMap<TUser = SanctumUser> {
  init: { user: TUser | null }
  login: { user: TUser }
  logout: Record<string, never>
  refresh: { user: TUser | null }
  "two-factor-required": Record<string, never>
  error: { error: SanctumError }
  redirect: { to: string; reason: string }
  request: { url: string; init: RequestInit }
  response: { url: string; response: Response }
}

export type SanctumEventName = keyof SanctumEventMap

export type SanctumEventHandler<
  TUser = SanctumUser,
  K extends SanctumEventName = SanctumEventName,
> = (payload: SanctumEventMap<TUser>[K]) => void

export type RequestInterceptor = (
  request: Request,
) => Request | Promise<Request>

export type ResponseInterceptor = (
  response: Response,
  request: Request,
) => Response | Promise<Response>

export interface Interceptors {
  request?: RequestInterceptor[]
  response?: ResponseInterceptor[]
}

// ── Token storage ────────────────────────────────────────────────────────────

/** Bearer token storage interface (token mode). Swappable. */
export interface SanctumTokenStorage {
  get(): Promise<string | null> | string | null
  set(token: string): Promise<void> | void
  remove(): Promise<void> | void
}

// ── Public config (input) & resolved (internal) ──────────────────────────────

/** Config provided by the consumer. Only `baseUrl` is required. */
export interface SanctumConfig {
  baseUrl: string
  mode?: AuthMode
  /** App origin for the Referer header (default: window.location.origin when available). */
  origin?: string
  features?: FeatureFlags
  endpoints?: DeepPartial<SanctumEndpoints>
  csrf?: Partial<CsrfConfig>
  redirect?: Partial<RedirectConfig>
  logLevel?: LogLevel
  /** Fetch the user on init (default true). */
  initialRequest?: boolean
  /** Retry once on a CSRF failure (419). Defaults to true for cookie mode. */
  retryOnCsrfMismatch?: boolean
  /** Token storage (token mode). Default MemoryStorage. */
  storage?: SanctumTokenStorage
  interceptors?: Interceptors
  /** Lifecycle event handlers (a declarative alternative to emitter.on). */
  events?: Partial<{
    [K in SanctumEventName]: SanctumEventHandler<SanctumUser, K>
  }>
  /** When a request returns 401: clear state + redirect to this path (false = don't). */
  redirectIfUnauthenticated?: string | false
  /** Custom fetch implementation (default: globalThis.fetch). */
  fetch?: typeof fetch
}

/** Config after resolveConfig: all defaults filled in. */
export interface ResolvedSanctumConfig {
  baseUrl: string
  mode: AuthMode
  origin: string | undefined
  features: Required<Omit<FeatureFlags, "twoFactorAuthentication" | "passkeys">> & {
    twoFactorAuthentication: false | Required<TwoFactorFeature>
    passkeys: false | Required<PasskeysFeature>
  }
  endpoints: SanctumEndpoints
  csrf: CsrfConfig
  redirect: RedirectConfig
  logLevel: LogLevel
  initialRequest: boolean
  retryOnCsrfMismatch: boolean
  storage: SanctumTokenStorage | undefined
  interceptors: Required<Interceptors>
  events: Partial<{
    [K in SanctumEventName]: SanctumEventHandler<SanctumUser, K>
  }>
  redirectIfUnauthenticated: string | false
  fetch: typeof fetch
}

// ── Auth payloads & results ──────────────────────────────────────────────────

export interface LoginCredentials {
  email?: string
  /** Supports backends that use `username` (config/fortify.php). */
  username?: string
  password: string
  remember?: boolean
  [key: string]: unknown
}

/** Discriminated login result — consumers MUST check `status` (so 2FA isn't missed). */
export type LoginResult<TUser = SanctumUser> =
  | { status: "authenticated"; user: TUser }
  | { status: "two-factor-required" }

export interface TwoFactorChallengePayload {
  code?: string
  recovery_code?: string
}

export interface RegisterPayload {
  name?: string
  email?: string
  username?: string
  password?: string
  password_confirmation?: string
  [key: string]: unknown
}

export interface ForgotPasswordPayload {
  email: string
  [key: string]: unknown
}

export interface ResetPasswordPayload {
  token: string
  email: string
  password: string
  password_confirmation: string
  [key: string]: unknown
}

export interface ConfirmPasswordPayload {
  password: string
}

export interface UpdatePasswordPayload {
  current_password: string
  password: string
  password_confirmation: string
  [key: string]: unknown
}
