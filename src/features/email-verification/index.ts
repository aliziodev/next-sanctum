import type { ResolvedSanctumConfig, SanctumClient } from "../../core"

export interface EmailVerificationApi {
  /** Resend the verification email (Fortify `POST /email/verification-notification`). */
  resendEmailVerification(): Promise<void>
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
  }
}
