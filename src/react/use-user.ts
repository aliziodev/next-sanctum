import { useSanctumContext } from "./context"
import type { SanctumUser } from "../core"

/** Reactive user (null when not authenticated). Cast via the generic. */
export function useUser<TUser = SanctumUser>(): TUser | null {
  return useSanctumContext<TUser>().user
}
