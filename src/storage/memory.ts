import type { SanctumTokenStorage } from "../core"

/** In-memory token storage (lost on reload). Default for token mode. */
export class MemoryStorage implements SanctumTokenStorage {
  private token: string | null = null

  get(): string | null {
    return this.token
  }
  set(token: string): void {
    this.token = token
  }
  remove(): void {
    this.token = null
  }
}
