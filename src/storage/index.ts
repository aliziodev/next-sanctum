import type { ResolvedSanctumConfig, SanctumTokenStorage } from "../core"
import { MemoryStorage } from "./memory"

export { MemoryStorage } from "./memory"
export { LocalStorage } from "./local-storage"
export { CookieTokenStorage } from "./cookie"
export type { CookieStorageOptions } from "./cookie"

/** Effective storage: config.storage, or the default MemoryStorage for token mode. */
export function resolveTokenStorage(
  config: ResolvedSanctumConfig,
): SanctumTokenStorage | undefined {
  if (config.storage) return config.storage
  if (config.mode === "token") return new MemoryStorage()
  return undefined
}
