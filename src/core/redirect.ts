/**
 * Open-redirect protection. Only allows SAME-ORIGIN destinations (a relative path
 * or an absolute URL with the same origin), with an optional path allowlist.
 * See PRD §12.1 (Open redirect) & §18 (a unit test is required).
 */

export interface SafeRedirectOptions {
  /** App origin (e.g. https://app.domain.com). When set, same-origin absolute URLs are allowed. */
  origin?: string
  /** Path prefix allowlist. When set, the result must start with one of them. */
  allowList?: string[]
}

/** Reject backslashes and any control character (Tab/LF/CR are stripped by the URL
 * parser, which could turn `/\t/evil.com` into `//evil.com` and bypass the `//` guard). */
function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
    if (value[i] === "\\") return true
  }
  return false
}

/**
 * Return `target` when it is safe (same-origin), otherwise `fallback`.
 * Rejects: `//evil.com`, `https://evil.com`, the `javascript:` scheme, control-char
 * injection (`/\t//evil.com`), and backslash tricks.
 */
export function safeRedirect(
  target: string | null | undefined,
  fallback: string,
  options: SafeRedirectOptions = {},
): string {
  if (!target) return fallback
  const trimmed = target.trim()
  if (trimmed === "") return fallback
  if (hasUnsafeChars(trimmed)) return fallback

  let path: string | null = null

  if (trimmed.startsWith("/")) {
    // Reject protocol-relative (//evil.com).
    if (trimmed.startsWith("//")) return fallback
    path = trimmed
  } else if (options.origin) {
    try {
      const url = new URL(trimmed)
      const base = new URL(options.origin)
      if (url.origin === base.origin) {
        path = url.pathname + url.search + url.hash
      }
    } catch {
      // not a valid URL → reject
    }
  }

  if (path === null) return fallback

  // Defense-in-depth: resolve the path and confirm it stays same-origin.
  try {
    const base = options.origin ?? "https://sanctum.invalid"
    if (new URL(path, base).origin !== new URL(base).origin) return fallback
  } catch {
    return fallback
  }

  if (options.allowList && options.allowList.length > 0) {
    const safe = path
    const allowed = options.allowList.some(
      (prefix) => safe === prefix || safe.startsWith(prefix),
    )
    if (!allowed) return fallback
  }

  return path
}
