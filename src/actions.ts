import "server-only"
import { cookies } from "next/headers"
import { applySetCookies, decodeCookieValue, resolveServerBaseUrl } from "./core"
import type {
  ConfirmPasswordPayload,
  ForgotPasswordPayload,
  LoginCredentials,
  RegisterPayload,
  ResetPasswordPayload,
  TwoFactorChallengePayload,
} from "./core"

/**
 * Server-action helpers. WRAPPED by the consumer's own Server Action (`'use server'`)
 * — not literally `'use server'` (see §6 of the plan). Runs the CSRF→POST flow and
 * writes Laravel's Set-Cookie into `cookies()` so the session is persisted.
 *
 * **Security — Server Actions ONLY.** These helpers bootstrap and echo Laravel's CSRF
 * token themselves, so Laravel can no longer tell a cross-site call apart. The
 * effective CSRF protection is Next.js's Server-Action Origin↔Host check. Calling
 * them from a plain Route Handler skips that check: a cross-site form POST to your
 * handler could then e.g. log the victim into an attacker's account (login CSRF).
 * If you must call these from a Route Handler, validate the request's `Origin`
 * header against your app origin first.
 */

export interface ActionConfig {
  baseUrl?: string
  endpoints?: {
    csrf?: string
    login?: string
    logout?: string
    register?: string
    forgotPassword?: string
    resetPassword?: string
    confirmPassword?: string
    twoFactorChallenge?: string
  }
  csrf?: { cookie?: string; header?: string }
}

export interface ActionResult {
  ok: boolean
  status: number
  /** True when login requires a 2FA challenge (Fortify `two_factor`). */
  twoFactor?: boolean
  /** Laravel validation errors (422). */
  errors?: Record<string, string[]>
}

const DEFAULTS = {
  csrf: "/sanctum/csrf-cookie",
  login: "/login",
  logout: "/logout",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  confirmPassword: "/user/confirm-password",
  twoFactorChallenge: "/two-factor-challenge",
}

async function readErrors(
  response: Response,
): Promise<Record<string, string[]> | undefined> {
  try {
    const data = (await response.json()) as { errors?: Record<string, string[]> }
    return data?.errors
  } catch {
    return undefined
  }
}

interface RawResult {
  ok: boolean
  status: number
  raw: Response
}

async function statefulPost(
  path: string,
  json: unknown,
  config?: ActionConfig,
): Promise<RawResult> {
  const store = await cookies()
  const base = resolveServerBaseUrl(config?.baseUrl, "actions")
  const csrfCookie = config?.csrf?.cookie ?? "XSRF-TOKEN"
  const csrfHeader = config?.csrf?.header ?? "X-XSRF-TOKEN"
  const csrfPath = config?.endpoints?.csrf ?? DEFAULTS.csrf

  let token = store.get(csrfCookie)?.value
  if (!token) {
    const csrfResponse = await fetch(`${base}${csrfPath}`, {
      headers: { cookie: store.toString(), accept: "application/json" },
      cache: "no-store",
    })
    applySetCookies(store, csrfResponse)
    token = store.get(csrfCookie)?.value
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    cookie: store.toString(),
    // Same as serverFetch: a server-side fetch carries no browser Origin, so present
    // the API's own origin so Sanctum's stateful-domain check recognises the session
    // (endpoints behind `auth:sanctum`, e.g. confirm-password, would 401 without it).
    origin: new URL(base).origin,
  }
  if (token) headers[csrfHeader] = decodeCookieValue(token)

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(json ?? {}),
    cache: "no-store",
  })
  applySetCookies(store, response)
  return { ok: response.ok, status: response.status, raw: response }
}

async function toResult(result: RawResult): Promise<ActionResult> {
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      errors: result.status === 422 ? await readErrors(result.raw) : undefined,
    }
  }
  return { ok: true, status: result.status }
}

/** Login (CSRF → POST /login). Check `twoFactor` on the result before assuming success. */
export async function login(
  credentials: LoginCredentials,
  config?: ActionConfig,
): Promise<ActionResult> {
  const result = await statefulPost(
    config?.endpoints?.login ?? DEFAULTS.login,
    credentials,
    config,
  )
  if (!result.ok) return toResult(result)

  let twoFactor = false
  try {
    const data = (await result.raw.json()) as { two_factor?: boolean }
    twoFactor = Boolean(data?.two_factor)
  } catch {
    // empty body → not 2FA
  }
  return { ok: true, status: result.status, twoFactor }
}

export async function logout(config?: ActionConfig): Promise<ActionResult> {
  return toResult(
    await statefulPost(config?.endpoints?.logout ?? DEFAULTS.logout, {}, config),
  )
}

export async function register(
  payload: RegisterPayload,
  config?: ActionConfig,
): Promise<ActionResult> {
  return toResult(
    await statefulPost(
      config?.endpoints?.register ?? DEFAULTS.register,
      payload,
      config,
    ),
  )
}

export async function twoFactorChallenge(
  payload: TwoFactorChallengePayload,
  config?: ActionConfig,
): Promise<ActionResult> {
  return toResult(
    await statefulPost(
      config?.endpoints?.twoFactorChallenge ?? DEFAULTS.twoFactorChallenge,
      payload,
      config,
    ),
  )
}

export async function forgotPassword(
  payload: ForgotPasswordPayload,
  config?: ActionConfig,
): Promise<ActionResult> {
  return toResult(
    await statefulPost(
      config?.endpoints?.forgotPassword ?? DEFAULTS.forgotPassword,
      payload,
      config,
    ),
  )
}

export async function resetPassword(
  payload: ResetPasswordPayload,
  config?: ActionConfig,
): Promise<ActionResult> {
  return toResult(
    await statefulPost(
      config?.endpoints?.resetPassword ?? DEFAULTS.resetPassword,
      payload,
      config,
    ),
  )
}

export async function confirmPassword(
  payload: ConfirmPasswordPayload,
  config?: ActionConfig,
): Promise<ActionResult> {
  return toResult(
    await statefulPost(
      config?.endpoints?.confirmPassword ?? DEFAULTS.confirmPassword,
      payload,
      config,
    ),
  )
}
