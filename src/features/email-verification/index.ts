import type {
  ResolvedSanctumConfig,
  SanctumClient,
  VerifyEmailPayload,
} from "../../core"

export interface EmailVerificationApi {
  /** Resend the verification email (Fortify `POST /email/verification-notification`). */
  resendEmailVerification(): Promise<void>
  /**
   * Complete email verification from a signed link
   * (Fortify `GET /email/verify/{id}/{hash}?expires&signature`). Pass the params
   * parsed from the link the user clicked. Throws `SanctumError` (kind
   * `unauthorized`) when no authenticated session is present.
   */
  verifyEmail(payload: VerifyEmailPayload): Promise<void>
}

export function createEmailVerificationApi(
  client: SanctumClient,
  config: ResolvedSanctumConfig,
): EmailVerificationApi {
  return {
    async resendEmailVerification() {
      await client.raw(config.endpoints.emailVerificationNotification, {
        method: "POST",
      })
    },

    async verifyEmail(payload: VerifyEmailPayload) {
      const query = new URLSearchParams({
        expires: String(payload.expires),
        signature: payload.signature,
      }).toString()

      const path = `${config.endpoints.verifyEmail}/${encodeURIComponent(
        String(payload.id),
      )}/${encodeURIComponent(payload.hash)}?${query}`

      await client.request<void>(path, { method: "GET" })
    },
  }
}
