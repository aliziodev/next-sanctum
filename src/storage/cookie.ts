import { readCookie } from "../core"
import type { SanctumTokenStorage } from "../core"

let warned = false

export interface CookieStorageOptions {
  name?: string
  /** Cookie lifetime (seconds). Default 14 days. */
  maxAge?: number
  /** Default `Strict` for a credential cookie. */
  sameSite?: "Lax" | "Strict" | "None"
  secure?: boolean
  path?: string
}

/**
 * Cookie-based token storage written by the client. NOTE: cookies written by
 * JS CANNOT be HttpOnly. For true HttpOnly, set the cookie via a Route Handler/Server
 * Action and then attach the Bearer on the server (catch-all proxy). This storage is for
 * simple persistence, NOT a replacement for HttpOnly.
 */
export class CookieTokenStorage implements SanctumTokenStorage {
  private readonly name: string
  private readonly maxAge: number
  private readonly sameSite: "Lax" | "Strict" | "None"
  private readonly secure: boolean
  private readonly path: string

  constructor(options: CookieStorageOptions = {}) {
    this.name = options.name ?? "sanctum_token"
    this.maxAge = options.maxAge ?? 60 * 60 * 24 * 14
    this.sameSite = options.sameSite ?? "Strict"
    this.secure = options.secure ?? true
    this.path = options.path ?? "/"
  }

  private warnOnce(): void {
    if (warned) return
    warned = true
    console.warn(
      "[next-sanctum] CookieTokenStorage writes a non-HttpOnly cookie that is readable by JS (XSS-exposed). For production web apps, prefer an HttpOnly cookie set server-side + the catch-all proxy.",
    )
  }

  get(): string | null {
    const raw = readCookie(this.name)
    if (raw === null || raw === "") return null
    this.warnOnce()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  set(token: string): void {
    if (typeof document === "undefined") return
    this.warnOnce()
    const parts = [
      `${this.name}=${encodeURIComponent(token)}`,
      `Path=${this.path}`,
      `Max-Age=${this.maxAge}`,
      `SameSite=${this.sameSite}`,
    ]
    if (this.secure) parts.push("Secure")
    document.cookie = parts.join("; ")
  }
  remove(): void {
    if (typeof document === "undefined") return
    document.cookie = `${this.name}=; Path=${this.path}; Max-Age=0`
  }
}
