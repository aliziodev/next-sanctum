import type { ResolvedSanctumConfig, SanctumClient } from "../../core"

export interface ProfileApi {
  /** Update profile information (Fortify `PUT /user/profile-information`). */
  updateProfileInformation(payload: Record<string, unknown>): Promise<void>
}

export function createProfileApi(
  client: SanctumClient,
  config: ResolvedSanctumConfig,
): ProfileApi {
  return {
    async updateProfileInformation(payload) {
      await client.raw(config.endpoints.profileInformation, {
        method: "PUT",
        json: payload,
      })
    },
  }
}
