import { createContext, useContext } from "react"
import type {
  ConfirmPasswordPayload,
  ForgotPasswordPayload,
  LoginResult,
  RegisterPayload,
  ResetPasswordPayload,
  ResolvedSanctumConfig,
  SanctumClient,
  SanctumEventEmitter,
  SanctumUser,
  UpdatePasswordPayload,
  VerifyEmailPayload,
} from "../core"
import type { AuthApi } from "../features/auth"
import type { PasskeysApi } from "../features/passkeys"
import type { TwoFactorApi } from "../features/two-factor"

export type AuthStatus = "loading" | "authenticated" | "unauthenticated"

export interface SanctumContextValue<TUser = SanctumUser> {
  config: ResolvedSanctumConfig
  client: SanctumClient
  emitter: SanctumEventEmitter<TUser>
  user: TUser | null
  status: AuthStatus
  isAuthenticated: boolean
  isLoading: boolean
  login: AuthApi<TUser>["login"]
  logout: AuthApi<TUser>["logout"]
  refresh: AuthApi<TUser>["refreshIdentity"]
  /** Set the user manually (e.g. after a local update). */
  setUser: (user: TUser | null) => void
  // ── Fortify features ──
  register: (payload: RegisterPayload) => Promise<void>
  forgotPassword: (payload: ForgotPasswordPayload) => Promise<void>
  resetPassword: (payload: ResetPasswordPayload) => Promise<void>
  confirmPassword: (payload: ConfirmPasswordPayload) => Promise<void>
  confirmedPasswordStatus: () => Promise<boolean>
  updatePassword: (payload: UpdatePasswordPayload) => Promise<void>
  updateProfile: (payload: Record<string, unknown>) => Promise<void>
  resendEmailVerification: () => Promise<void>
  verifyEmail: (payload: VerifyEmailPayload) => Promise<void>
  twoFactor: TwoFactorApi
  passkeys: PasskeysApi
}

export const SanctumContext = createContext<SanctumContextValue | null>(null)

/** Get the context; throws a clear error if used outside the provider. */
export function useSanctumContext<TUser = SanctumUser>(): SanctumContextValue<TUser> {
  const ctx = useContext(SanctumContext)
  if (!ctx) {
    throw new Error("next-sanctum hooks must be used inside <SanctumProvider>.")
  }
  return ctx as unknown as SanctumContextValue<TUser>
}

export type LoginFn<TUser> = (
  ...args: Parameters<AuthApi<TUser>["login"]>
) => Promise<LoginResult<TUser>>
