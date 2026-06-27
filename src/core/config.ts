import { ConfigError } from "./errors"
import type {
  FeatureFlags,
  PasskeysFeature,
  ResolvedSanctumConfig,
  SanctumConfig,
  SanctumEndpoints,
  TwoFactorFeature,
} from "./types"

const DEFAULT_ENDPOINTS: SanctumEndpoints = {
  csrf: "/sanctum/csrf-cookie",
  login: "/login",
  logout: "/logout",
  user: "/api/user",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  emailVerificationNotification: "/email/verification-notification",
  verifyEmail: "/email/verify",
  confirmPassword: "/user/confirm-password",
  confirmedPasswordStatus: "/user/confirmed-password-status",
  profileInformation: "/user/profile-information",
  updatePassword: "/user/password",
  twoFactor: {
    challenge: "/two-factor-challenge",
    enable: "/user/two-factor-authentication",
    confirm: "/user/confirmed-two-factor-authentication",
    disable: "/user/two-factor-authentication",
    qrCode: "/user/two-factor-qr-code",
    secretKey: "/user/two-factor-secret-key",
    recoveryCodes: "/user/two-factor-recovery-codes",
  },
  passkeys: {
    loginOptions: "/passkeys/login/options",
    login: "/passkeys/login",
    confirmOptions: "/passkeys/confirm/options",
    confirm: "/passkeys/confirm",
    registerOptions: "/user/passkeys/options",
    register: "/user/passkeys",
    delete: "/user/passkeys",
  },
  sessions: {
    list: "/api/sessions",
    logoutOthers: "/api/sessions/others",
    logout: "/api/sessions",
  },
}

function resolveTwoFactor(
  value: FeatureFlags["twoFactorAuthentication"],
): false | Required<TwoFactorFeature> {
  if (value === false) return false
  if (value === undefined || value === true) {
    return { confirm: true, confirmPassword: true }
  }
  return {
    confirm: value.confirm ?? true,
    confirmPassword: value.confirmPassword ?? true,
  }
}

function resolvePasskeys(
  value: FeatureFlags["passkeys"],
): false | Required<PasskeysFeature> {
  if (value === undefined || value === false) return false
  if (value === true) return { confirmPassword: true }
  return { confirmPassword: value.confirmPassword ?? true }
}

function defaultOrigin(input?: string): string | undefined {
  if (input) return input
  if (typeof window !== "undefined") return window.location.origin
  return undefined
}

function resolveFetch(input?: typeof fetch): typeof fetch {
  const impl = input ?? globalThis.fetch
  if (typeof impl !== "function") {
    throw new ConfigError(
      "Native `fetch` is not available. Provide `config.fetch` (Node < 18) or use a modern runtime.",
    )
  }
  return impl.bind(globalThis)
}

/**
 * Validate + fill in config defaults. Fail-fast when `baseUrl` is missing to avoid
 * an SSR loop / fetching the URL `undefined` (see plan §10 risks).
 */
export function resolveConfig(input: SanctumConfig): ResolvedSanctumConfig {
  if (
    !input ||
    typeof input.baseUrl !== "string" ||
    input.baseUrl.trim() === ""
  ) {
    throw new ConfigError(
      "`baseUrl` is required (the Laravel API URL, e.g. https://api.domain.com).",
    )
  }

  const features = input.features ?? {}
  const endpoints = input.endpoints ?? {}

  return {
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    mode: input.mode ?? "cookie",
    origin: defaultOrigin(input.origin),
    features: {
      registration: features.registration ?? true,
      resetPasswords: features.resetPasswords ?? true,
      emailVerification: features.emailVerification ?? true,
      updateProfileInformation: features.updateProfileInformation ?? true,
      updatePasswords: features.updatePasswords ?? true,
      deviceSessions: features.deviceSessions ?? false,
      twoFactorAuthentication: resolveTwoFactor(features.twoFactorAuthentication),
      passkeys: resolvePasskeys(features.passkeys),
    },
    endpoints: {
      ...DEFAULT_ENDPOINTS,
      ...endpoints,
      twoFactor: { ...DEFAULT_ENDPOINTS.twoFactor, ...endpoints.twoFactor },
      passkeys: { ...DEFAULT_ENDPOINTS.passkeys, ...endpoints.passkeys },
      sessions: { ...DEFAULT_ENDPOINTS.sessions, ...endpoints.sessions },
    },
    csrf: {
      cookie: input.csrf?.cookie ?? "XSRF-TOKEN",
      header: input.csrf?.header ?? "X-XSRF-TOKEN",
    },
    redirect: {
      onLogin: input.redirect?.onLogin ?? "/",
      onLogout: input.redirect?.onLogout ?? "/",
      onAuthOnly: input.redirect?.onAuthOnly ?? "/login",
      onGuestOnly: input.redirect?.onGuestOnly ?? "/",
      keepRequestedRoute: input.redirect?.keepRequestedRoute ?? false,
    },
    logLevel: input.logLevel ?? 3,
    initialRequest: input.initialRequest ?? true,
    retryOnCsrfMismatch: input.retryOnCsrfMismatch ?? true,
    storage: input.storage,
    interceptors: {
      request: input.interceptors?.request ?? [],
      response: input.interceptors?.response ?? [],
    },
    events: input.events ?? {},
    redirectIfUnauthenticated: input.redirectIfUnauthenticated ?? false,
    fetch: resolveFetch(input.fetch),
  }
}

/**
 * Resolve the server-side base URL (`SANCTUM_BASE_URL`, falling back to the public var
 * for dev). Shared by `server.ts`/`actions.ts`. Fails fast with a clear ConfigError.
 */
export function resolveServerBaseUrl(
  explicit?: string,
  label = "server helpers",
): string {
  const baseUrl =
    explicit ??
    process.env.SANCTUM_BASE_URL ??
    process.env.NEXT_PUBLIC_SANCTUM_BASE_URL
  if (!baseUrl) {
    throw new ConfigError(
      `SANCTUM_BASE_URL (server) is not set for next-sanctum ${label}.`,
    )
  }
  return baseUrl.replace(/\/+$/, "")
}
