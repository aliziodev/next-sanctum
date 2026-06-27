"use client"

/**
 * next-sanctum client entry. Provider + hooks for Client Components.
 * Server helpers live in `next-sanctum/server`, the proxy in `next-sanctum/proxy`.
 */
export { SanctumProvider } from "./react/provider"
export type { SanctumProviderProps } from "./react/provider"
export { useAuth } from "./react/use-auth"
export type { UseAuthResult } from "./react/use-auth"
export { useUser } from "./react/use-user"
export { useApi } from "./react/use-api"
export type { UseApiOptions, UseApiResult } from "./react/use-api"
export { useClient } from "./react/use-client"
export { useResource } from "./react/use-resource"
export type { ResourceClient } from "./react/use-resource"
export { useMutation } from "./react/use-mutation"
export type { UseMutationOptions, UseMutationResult } from "./react/use-mutation"
export { useTwoFactor } from "./react/use-two-factor"
export type { TwoFactorApi } from "./features/two-factor"
export { usePasskeys } from "./react/use-passkeys"
export type { PasskeyRegistration, PasskeysApi } from "./features/passkeys"

// Token storage (token mode).
export { CookieTokenStorage, LocalStorage, MemoryStorage } from "./storage"
export type { CookieStorageOptions } from "./storage"

// Error classes (values) — for `instanceof` checks in the consumer.
export { SanctumError, ValidationError, ConfigError } from "./core"

// Public types.
export type {
  AuthMode,
  ConfirmPasswordPayload,
  FeatureFlags,
  ForgotPasswordPayload,
  Interceptors,
  LoginCredentials,
  LoginResult,
  LogLevel,
  RegisterPayload,
  RequestInterceptor,
  ResetPasswordPayload,
  ResponseInterceptor,
  SanctumClient,
  SanctumConfig,
  SanctumEndpoints,
  SanctumErrorKind,
  SanctumRequestInit,
  SanctumTokenStorage,
  SanctumUser,
  TwoFactorChallengePayload,
  UpdatePasswordPayload,
  VerifyEmailPayload,
} from "./core"
