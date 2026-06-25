import { useSanctumContext } from "./context"
import type { PasskeysApi } from "../features/passkeys"

/**
 * Passkeys API (interop with @laravel/passkeys). `login()` automatically refreshes
 * the identity on success. Requires the `@laravel/passkeys` package in the consumer.
 */
export function usePasskeys(): PasskeysApi {
  return useSanctumContext().passkeys
}
