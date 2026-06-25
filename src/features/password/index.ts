import type {
  ConfirmPasswordPayload,
  ForgotPasswordPayload,
  ResetPasswordPayload,
  ResolvedSanctumConfig,
  SanctumClient,
  UpdatePasswordPayload,
} from "../../core"

export interface PasswordApi {
  /** Send reset email (Fortify `POST /forgot-password`). */
  forgotPassword(payload: ForgotPasswordPayload): Promise<void>
  /** Reset password with a token (Fortify `POST /reset-password`). */
  resetPassword(payload: ResetPasswordPayload): Promise<void>
  /** Confirm the session password (Fortify `POST /user/confirm-password`). */
  confirmPassword(payload: ConfirmPasswordPayload): Promise<void>
  /** Password confirmation status (`GET /user/confirmed-password-status`). */
  confirmedPasswordStatus(): Promise<boolean>
  /** Update password (Fortify `PUT /user/password`). */
  updatePassword(payload: UpdatePasswordPayload): Promise<void>
}

export function createPasswordApi(
  client: SanctumClient,
  config: ResolvedSanctumConfig,
): PasswordApi {
  const ep = config.endpoints
  return {
    async forgotPassword(payload) {
      await client.raw(ep.forgotPassword, { method: "POST", json: payload })
    },
    async resetPassword(payload) {
      await client.raw(ep.resetPassword, { method: "POST", json: payload })
    },
    async confirmPassword(payload) {
      await client.raw(ep.confirmPassword, { method: "POST", json: payload })
    },
    async confirmedPasswordStatus() {
      const data = await client.request<{ confirmed?: boolean }>(
        ep.confirmedPasswordStatus,
        { method: "GET" },
      )
      return Boolean(data?.confirmed)
    },
    async updatePassword(payload) {
      await client.raw(ep.updatePassword, { method: "PUT", json: payload })
    },
  }
}
