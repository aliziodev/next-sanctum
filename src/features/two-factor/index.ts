import { ConfigError } from "../../core"
import type {
  ResolvedSanctumConfig,
  SanctumClient,
  TwoFactorChallengePayload,
} from "../../core"

export interface TwoFactorApi {
  /** Complete the 2FA login (`POST /two-factor-challenge`, code / recovery_code). */
  challenge(payload: TwoFactorChallengePayload): Promise<void>
  /** Enable 2FA (`POST /user/two-factor-authentication`). Requires password confirmation. */
  enable(): Promise<void>
  /** Confirm 2FA with a code (`POST /user/confirmed-two-factor-authentication`). */
  confirm(code: string): Promise<void>
  /** Disable 2FA (`DELETE /user/two-factor-authentication`). */
  disable(): Promise<void>
  /** QR code SVG (`GET /user/two-factor-qr-code`). */
  getQrCode(): Promise<{ svg: string }>
  /** Secret key (`GET /user/two-factor-secret-key`). */
  getSecretKey(): Promise<{ secretKey: string }>
  /** Recovery codes (`GET /user/two-factor-recovery-codes`). */
  getRecoveryCodes(): Promise<string[]>
  /** Regenerate recovery codes (`POST /user/two-factor-recovery-codes`). */
  regenerateRecoveryCodes(): Promise<void>
}

export function createTwoFactorApi(
  client: SanctumClient,
  config: ResolvedSanctumConfig,
): TwoFactorApi {
  const ep = config.endpoints.twoFactor

  function ensureEnabled() {
    if (config.features.twoFactorAuthentication === false) {
      throw new ConfigError('The "twoFactorAuthentication" feature is disabled in config.')
    }
  }

  return {
    async challenge(payload) {
      // Challenge may run even when 2FA management is disabled (login flow).
      await client.raw(ep.challenge, { method: "POST", json: payload })
    },
    async enable() {
      ensureEnabled()
      await client.raw(ep.enable, { method: "POST" })
    },
    async confirm(code) {
      ensureEnabled()
      await client.raw(ep.confirm, { method: "POST", json: { code } })
    },
    async disable() {
      ensureEnabled()
      await client.raw(ep.disable, { method: "DELETE" })
    },
    async getQrCode() {
      ensureEnabled()
      return client.request<{ svg: string }>(ep.qrCode, { method: "GET" })
    },
    async getSecretKey() {
      ensureEnabled()
      return client.request<{ secretKey: string }>(ep.secretKey, { method: "GET" })
    },
    async getRecoveryCodes() {
      ensureEnabled()
      return client.request<string[]>(ep.recoveryCodes, { method: "GET" })
    },
    async regenerateRecoveryCodes() {
      ensureEnabled()
      await client.raw(ep.recoveryCodes, { method: "POST" })
    },
  }
}
