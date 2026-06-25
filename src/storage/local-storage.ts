import type { SanctumTokenStorage } from "../core"

const DEFAULT_KEY = "sanctum.token"
let warned = false

/** Token storage in localStorage. OPT-IN — vulnerable to XSS (see PRD §12). */
export class LocalStorage implements SanctumTokenStorage {
  constructor(private readonly key: string = DEFAULT_KEY) {}

  private warnOnce(): void {
    if (warned) return
    warned = true
    console.warn(
      "[next-sanctum] LocalStorage token storage is vulnerable to XSS. Use it only when necessary (e.g. Capacitor); for the web, prefer HttpOnly cookies + a server proxy.",
    )
  }

  get(): string | null {
    if (typeof window === "undefined") return null
    this.warnOnce()
    return window.localStorage.getItem(this.key)
  }
  set(token: string): void {
    if (typeof window === "undefined") return
    this.warnOnce()
    window.localStorage.setItem(this.key, token)
  }
  remove(): void {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(this.key)
  }
}
