import { useSanctumContext } from "./context"
import type { TwoFactorApi } from "../features/two-factor"

/**
 * Two-factor API (Fortify): challenge during login + management (enable/confirm/disable,
 * QR, recovery codes). `challenge()` automatically refreshes the identity on success.
 */
export function useTwoFactor(): TwoFactorApi {
  return useSanctumContext().twoFactor
}
