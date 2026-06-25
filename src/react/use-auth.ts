import { useSanctumContext } from "./context"
import type {
  ConfirmPasswordPayload,
  ForgotPasswordPayload,
  LoginCredentials,
  LoginResult,
  RegisterPayload,
  ResetPasswordPayload,
  SanctumUser,
  UpdatePasswordPayload,
} from "../core"

export interface UseAuthResult<TUser = SanctumUser> {
  user: TUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginCredentials) => Promise<LoginResult<TUser>>
  logout: () => Promise<void>
  refresh: () => Promise<TUser | null>
  register: (payload: RegisterPayload) => Promise<void>
  forgotPassword: (payload: ForgotPasswordPayload) => Promise<void>
  resetPassword: (payload: ResetPasswordPayload) => Promise<void>
  confirmPassword: (payload: ConfirmPasswordPayload) => Promise<void>
  confirmedPasswordStatus: () => Promise<boolean>
  updatePassword: (payload: UpdatePasswordPayload) => Promise<void>
  updateProfile: (payload: Record<string, unknown>) => Promise<void>
  resendEmailVerification: () => Promise<void>
}

/** Authentication & account state and actions (login, register, password, profile, email verification). */
export function useAuth<TUser = SanctumUser>(): UseAuthResult<TUser> {
  const ctx = useSanctumContext<TUser>()
  return {
    user: ctx.user,
    isAuthenticated: ctx.isAuthenticated,
    isLoading: ctx.isLoading,
    login: ctx.login,
    logout: ctx.logout,
    refresh: ctx.refresh,
    register: ctx.register,
    forgotPassword: ctx.forgotPassword,
    resetPassword: ctx.resetPassword,
    confirmPassword: ctx.confirmPassword,
    confirmedPasswordStatus: ctx.confirmedPasswordStatus,
    updatePassword: ctx.updatePassword,
    updateProfile: ctx.updateProfile,
    resendEmailVerification: ctx.resendEmailVerification,
  }
}
