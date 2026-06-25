import { useSanctumContext } from "./context"
import type { SanctumClient } from "../core"

/**
 * The authenticated HTTP client for imperative requests — i.e. CRUD beyond auth
 * (create/update/delete or on-demand reads). `client.request<T>(path, { method, json })`
 * returns parsed JSON; `client.raw(...)` returns the Response. It automatically attaches
 * CSRF (cookie mode) or Bearer (token mode), the base URL, and credentials.
 */
export function useClient(): SanctumClient {
  return useSanctumContext().client
}
