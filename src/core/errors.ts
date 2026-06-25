/**
 * Error types for next-sanctum. All failures are normalized to `SanctumError`
 * so consumers can handle them consistently (see plan §10: errors must not leak).
 */

export type SanctumErrorKind =
  | "config" // invalid configuration (e.g. missing baseUrl)
  | "network" // fetch failed before getting a response
  | "unauthorized" // HTTP 401
  | "forbidden" // HTTP 403
  | "csrf" // HTTP 419 (CSRF token mismatch / session expired)
  | "validation" // HTTP 422 (Laravel validation)
  | "http" // other non-2xx
  | "unknown"

export interface SanctumErrorOptions {
  kind: SanctumErrorKind
  status?: number
  /** The already-parsed response body (JSON when possible). */
  data?: unknown
  cause?: unknown
}

/** Base error for all module failures. */
export class SanctumError extends Error {
  readonly kind: SanctumErrorKind
  readonly status?: number
  readonly data?: unknown

  constructor(message: string, options: SanctumErrorOptions) {
    super(message, { cause: options.cause })
    this.name = "SanctumError"
    this.kind = options.kind
    this.status = options.status
    this.data = options.data
  }
}

/** Invalid configuration — fail-fast on init (see resolveConfig). */
export class ConfigError extends SanctumError {
  constructor(message: string, cause?: unknown) {
    super(message, { kind: "config", cause })
    this.name = "ConfigError"
  }
}

/**
 * HTTP 422 from Laravel. Exposes field errors (`{ field: string[] }`) so
 * consumers can map them to their forms.
 */
export class ValidationError extends SanctumError {
  readonly errors: Record<string, string[]>

  constructor(message: string, errors: Record<string, string[]>, data?: unknown) {
    super(message, { kind: "validation", status: 422, data })
    this.name = "ValidationError"
    this.errors = errors
  }
}

interface LaravelErrorBody {
  message?: string
  errors?: Record<string, string[]>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Try to read the response body as JSON; return undefined if it isn't JSON. */
async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? ""
  try {
    if (contentType.includes("application/json")) {
      return await response.json()
    }
    const text = await response.text()
    return text.length > 0 ? text : undefined
  } catch {
    return undefined
  }
}

function kindForStatus(status: number): SanctumErrorKind {
  switch (status) {
    case 401:
      return "unauthorized"
    case 403:
      return "forbidden"
    case 419:
      return "csrf"
    case 422:
      return "validation"
    default:
      return "http"
  }
}

/**
 * Build a `SanctumError` from a non-2xx Response. The message is taken from the
 * Laravel body (`message`) when present, without leaking the stack or internal details.
 */
export async function errorFromResponse(response: Response): Promise<SanctumError> {
  const data = await readBody(response)
  const body: LaravelErrorBody = isRecord(data) ? (data as LaravelErrorBody) : {}
  const message = body.message ?? `Request failed with status ${response.status}.`

  if (response.status === 422) {
    return new ValidationError(message, body.errors ?? {}, data)
  }

  return new SanctumError(message, {
    kind: kindForStatus(response.status),
    status: response.status,
    data,
  })
}

/** Wrap a network error (fetch rejection) into a SanctumError. */
export function networkError(cause: unknown): SanctumError {
  const message =
    cause instanceof Error ? cause.message : "Network request failed."
  return new SanctumError(message, { kind: "network", cause })
}
