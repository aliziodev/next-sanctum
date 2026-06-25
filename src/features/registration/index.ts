import { ConfigError } from "../../core"
import type { RegisterPayload, ResolvedSanctumConfig, SanctumClient } from "../../core"

export interface RegistrationApi {
  register(payload: RegisterPayload): Promise<void>
}

/** Registration (Fortify `POST /register`). On success → a login session is created by the backend. */
export function createRegistrationApi(
  client: SanctumClient,
  config: ResolvedSanctumConfig,
): RegistrationApi {
  return {
    async register(payload) {
      if (!config.features.registration) {
        throw new ConfigError('The "registration" feature is disabled in config.')
      }
      await client.raw(config.endpoints.register, { method: "POST", json: payload })
    },
  }
}
